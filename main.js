const Apify = require('apify');
const {fetchProductsAsin, fetchProductsDetail, fetchOffers} = require('./amazonscr/scraper.js');

Apify.main(async () => {
    const input = await Apify.getInput();
    let keyword = 'phone';
    let email = undefined;
    if (input) {
        keyword = input['keyword'];
        email = input['email'];
    }

    console.log(`Fetching products page for keyword "${keyword}"`);
    const asins = await fetchProductsAsin(keyword);
    // const asins = ['xx'];
    // const productDetails = [{'url' : 'https://www.amazon.com/dp/B08XQHKM5X'}];
    if (asins) {
        console.log(`Fetched ${asins.length} products, fetching products detail...`);
        const productDetails = await fetchProductsDetail(asins);

        console.log(`Fetched ${productDetails.length} product details, fetching offers...`);
        console.log(productDetails);

        const productOffers = await fetchOffers(productDetails, keyword);
        console.log(productOffers);
        console.log(`Got ${productOffers.length} product offers.`);

        const dataset = await Apify.openDataset('offers');
        await dataset.pushData(productOffers);
        const datasetID = (await dataset.getInfo())['id'];
        const datasetURL = `https://api.apify.com/v2/datasets/${datasetID}/items?clean=true&format=json`;

        if (email !== undefined) {
            await Apify.call('apify/send-mail', {
                to: email,
                subject: 'This is for the Apify SDK exercise (Jakub Schimer)',
                text: `dataset: ${datasetURL}`,
            });
        }

    } else {
        console.log(`Unable to fetch product ASINs for keyword "${asins}".`);
    }
});
