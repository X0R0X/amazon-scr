const {RequestList} = require("apify");
const Apify = require('apify');

const urls = require('./urls.js');
const formatString = require('./utils.js').formatString;
const cfg = require('./config.js');

const headlessBrowser = cfg.PUPPETTEER_HEADLESS;

async function fetchProductsAsin(keyword) {
    const requestList = new RequestList({
        sources: [formatString(urls.URL_PRODUCT_SEARCH, [keyword])]
    });
    await requestList.initialize();

    let asins = null;
    const proxyConfiguration = await Apify.createProxyConfiguration({});
    const crawler = new Apify.PuppeteerCrawler({
        launchContext: {
            launchOptions: {
                headless: headlessBrowser
            }
        },
        requestList: requestList,
        proxyConfiguration:proxyConfiguration,
        handlePageFunction: async ({page}) => {
            asins = await page.$$eval(
                '.s-asin',
                e => e.map(e => e.getAttribute("data-asin"))
            );
        }
    });

    await crawler.run();

    return asins;
}

async function fetchProductsDetail(asins) {
    const requestList = new RequestList({
        sources: asins.map(a => formatString(urls.URL_PRODUCT_DETAIL, [a]))
    });
    await requestList.initialize();

    const productDetails = [];
    const proxyConfiguration = await Apify.createProxyConfiguration({});
    const crawler = new Apify.PuppeteerCrawler({
        launchContext: {
            launchOptions: {
                headless: headlessBrowser
            }
        },
        proxyConfiguration:proxyConfiguration,
        requestList: requestList,
        handlePageFunction: async ({page}) => {
            productDetails.push({
                'url': page.url(),
                'title': await page.title(),
                'description': await page.$$eval(
                    '#feature-bullets > ul > li > span',
                    e => e.map(e => e.textContent.trim()).join('\n')
                )
            });
            console.log(`Got product detail for ${page.url()}`);
        }
    });

    await crawler.run();

    return productDetails;
}

function log(m) {
    console.log(m);
}

async function fetchOffers(productDetails, keyword) {
    const requests = []
    productDetails.forEach(pd => {
            const a = pd['url'].split('/');
            const asin = a[a.length - 1];
            requests.push({
                url: formatString(urls.URL_PRODUCT_OFFERS, [asin]),
                userData: pd
            })
        }
    );
    const requestList = new RequestList({sources: requests});
    await requestList.initialize();
    const proxyConfiguration = await Apify.createProxyConfiguration({});
    let productOffers = [];
    const crawler = new Apify.PuppeteerCrawler({
        launchContext: {
            launchOptions: {
                headless: headlessBrowser
            }
        },
        requestList: requestList,
        proxyConfiguration: proxyConfiguration,
        handlePageFunction: async ({page, request, proxyInfo}) => {
            const productDetail = request.userData;
            console.log(`Offers for ${request.url}, proxy=${proxyInfo.url}`)
            await page.exposeFunction('log', log);
            const offers = await page.$eval(
                '#all-offers-display',
                (element, productDetail, keyword) => {
                    function getOffer(element, productDetail, keyword) {
                        // Reason for try / catch is for example
                        // https://www.amazon.com/dp/B08CFSZLQ4/ref=olp_aod_redir_impl1?_encoding=UTF8&aod=1&th=1
                        let price = null;
                        try {
                            price = Number(
                                element.querySelector(
                                    'span[class="a-price"] > span[class="a-offscreen"]'
                                ).textContent.substring(1)
                            );
                        } catch (e) {
                        }

                        let seller = element.querySelector(
                            '[rel="noopener"][role="link"]'
                        )
                        if (seller) {
                            seller = seller.textContent.trim();
                        } else {
                            try {
                                seller = element.querySelector(
                                    'span[aria-label="Amazon.com. Opens a new page"]'
                                ).textContent;
                            } catch (e) {
                            }
                        }

                        let shippingPrice = element.querySelector('.a-color-secondary.a-size-base');
                        if (shippingPrice) {
                            shippingPrice = shippingPrice.textContent;
                            shippingPrice = Number(shippingPrice.split(' ')[1].trim().substring(1));
                        }

                        return {
                            'url': productDetail['url'],
                            'title': productDetail['title'],
                            'description': productDetail['description'],
                            'keyword': keyword,
                            'sellerName': seller,
                            'price': price,
                            'shippingPrice': shippingPrice
                        };
                    }

                    const topOffer = getOffer(
                        element.querySelector('#aod-pinned-offer'),
                        productDetail,
                        keyword
                    );
                    const offers = [topOffer];
                    element.querySelectorAll('#aod-offer-list > #aod-offer').forEach(
                        e => {
                            offers.push(getOffer(e, productDetail, keyword));
                        }
                    );

                    return offers;
                },
                productDetail,
                keyword
            );

            console.log(`Got ${offers.length} offers for ${request.url}`);
            productOffers = productOffers.concat(offers);
        }
    });

    await crawler.run();

    return productOffers;
}

module.exports.fetchProductsAsin = fetchProductsAsin;
module.exports.fetchProductsDetail = fetchProductsDetail;
module.exports.fetchOffers = fetchOffers;
