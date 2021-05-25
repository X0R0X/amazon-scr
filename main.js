const Apify = require('apify');
const urls = require('./amazonscr/urls.js')
const {RequestList} = require("apify");
const formatString = require('./amazonscr/utils.js').formatString

async function fetchProductsAsin(keyword) {
    const requestList = new RequestList({
        sources: [formatString(urls.URL_PRODUCT_SEARCH, [keyword])]
    });
    await requestList.initialize();

    let asins = null;
    const crawler = new Apify.PuppeteerCrawler({
        requestList: requestList,
        handlePageFunction: async ({page}) => {
            asins = await page.$$eval(
                '.s-asin',
                e => e.map(e => e.getAttribute("data-asin"))
            );
        }
    });

    await crawler.run();

    return asins
}

async function fetchProductsDetail(asins) {
    const requestList = new RequestList({
        sources: asins.map(a => formatString(urls.URL_PRODUCT_DETAIL, [a]))
    });
    await requestList.initialize();

    const productDetails = [];
    const crawler = new Apify.PuppeteerCrawler({
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
        }
    });

    await crawler.run();

    return productDetails;
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
    )
    const requestList = new RequestList({sources: requests});
    await requestList.initialize();

    const productOffers = [];
    const crawler = new Apify.PuppeteerCrawler({
        launchContext: {
            launchOptions: {
                headless: true
            }
        },
        requestList: requestList,
        handlePageFunction: async ({page, request}) => {
            const offers = await page.$$eval(
                '#aod-offer-list > #aod-offer',
                x => x.map(x => [
                    x.querySelector('#aod-offer-price > div > div > div > div > span > span').textContent,
                    x.querySelector(
                        '#aod-offer-soldBy > div > div > .a-fixed-left-grid-col.a-col-right > .a-size-small'
                    ).textContent.trim(),
                    x.querySelector('#aod-offer-price'),
                    // x.querySelector('#aod-offer-price > .a-color-secondary.a-size-base')
                ])
            );
            const topOffer = await page.$eval(
                '#aod-pinned-offer > div > div > div ',
                e => {
                    e.textContent
                }
            )

            const productDetail = request.userData;
            offers.forEach(o => {
                productOffers.push({
                    'url': productDetail['url'],
                    'title': productDetail['title'],
                    'description': productDetail['description'],
                    'keyword': keyword,
                    'sellerName': o[1],
                    'price': o[0],
                    'shippingPrice': o[2]
                })
            })
            console.log(`Got ${offers.length} offers for ${request.url}`)
        }
    });

    await crawler.run();

    return productOffers
}

Apify.main(async () => {
    // const productDetails = [{
    //     'url': 'https://www.amazon.com/dp/B08GL2HKLT',
    //     'title': 'Amazon.com',
    //     'description': 'xxx'
    // }]
    // const asins = ['B08GL2HKLT'];
    // const keyword = (await Apify.getInput())['keyword'];
    const keyword = 'phone';
    const asins = await fetchProductsAsin(keyword);
    if (asins) {
        console.log(`Fetched ${asins.length} products, fetching products detail...`);

        const productDetails = await fetchProductsDetail(asins);
        const productOffers = await fetchOffers(productDetails, keyword);

        console.log(productOffers);
        console.log(`Got ${productOffers.length} product offers.`);

        const dataset = await Apify.openDataset('offers');
        await dataset.pushData(productOffers);
    } else {
        console.log(`Unable to fetch product ASINs for keyword "${asins}".`);
    }
});
