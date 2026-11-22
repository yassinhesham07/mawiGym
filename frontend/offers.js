// Find the empty place on the page
var offersList = document.getElementById("offersList");


// This function builds the card of one offer
function makeOfferCard(offer) {
    // Decide what to write about the end date
    var endText = "No end date";
    if (offer.end_date != null) {
        endText = "Valid until " + offer.end_date;
    }

    // Decide what to write about the promo code
    var codeText = "";
    if (offer.promo_code != null) {
        codeText = "<p>Use code: <strong>" + offer.promo_code + "</strong> at checkout</p>";
    }

    var cardHtml = "<div class='card'><div>";
    cardHtml = cardHtml + "<span class='badge-purple'>" + offer.discount_percent + "% OFF</span>";
    cardHtml = cardHtml + "<h3>" + offer.title + "</h3>";
    cardHtml = cardHtml + "<p>" + offer.description + "</p>";
    cardHtml = cardHtml + codeText;
    cardHtml = cardHtml + "</div>";
    cardHtml = cardHtml + "<p>" + endText + "</p>";
    cardHtml = cardHtml + "</div>";
    return cardHtml;
}


// This function loads the offers from the backend
async function loadOffers() {
    try {
        // Ask the backend for the offers
        var response = await fetch(backendAddress + "/api/offers");
        var offers = await response.json();

        // If there are no offers, say so
        if (offers.length == 0) {
            offersList.innerHTML = "<p class='message'>No offers right now. Check again soon!</p>";
            return;
        }

        // Build one card for each offer
        var allCardsHtml = "";
        for (var i = 0; i < offers.length; i++) {
            allCardsHtml = allCardsHtml + makeOfferCard(offers[i]);
        }

        // Put the cards on the page
        offersList.innerHTML = allCardsHtml;
    } catch (error) {
        console.log(error);
        offersList.innerHTML = "<p class='message message-error'>Cannot load the offers. Is python app.py running?</p>";
    }
}


// Run it when the page opens
loadOffers();
