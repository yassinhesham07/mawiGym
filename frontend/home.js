// Find the two empty places on the page
var featuredCoachesList = document.getElementById("featuredCoachesList");
var offersList = document.getElementById("offersList");


// This function shows the first 3 coaches
async function loadFeaturedCoaches() {
    try {
        // Ask the backend for the coaches
        var response = await fetch(backendAddress + "/api/coaches");
        var coaches = await response.json();

        // Decide how many coaches to show (maximum 3)
        var howMany = coaches.length;
        if (howMany > 3) {
            howMany = 3;
        }

        // Build one card for each coach
        var cardsHtml = "";
        for (var i = 0; i < howMany; i++) {
            cardsHtml = cardsHtml + "<div class='card'><div>";
            cardsHtml = cardsHtml + "<span class='badge-purple'>" + escapeHtml(coaches[i].specialization) + "</span>";
            cardsHtml = cardsHtml + "<h3>" + escapeHtml(coaches[i].coach_name) + "</h3>";
            cardsHtml = cardsHtml + "<p class='coach-rating'>" + makeRatingText(coaches[i].avg_rating, coaches[i].review_count) + "</p>";
            cardsHtml = cardsHtml + "<p>" + coaches[i].experience_years + " years of experience</p>";
            cardsHtml = cardsHtml + "</div></div>";
        }

        // Put the cards on the page
        featuredCoachesList.innerHTML = cardsHtml;
    } catch (error) {
        console.log(error);
        featuredCoachesList.innerHTML = "<p class='message message-error'>Cannot load the coaches right now.</p>";
    }
}


// This function shows the current offers
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
        var cardsHtml = "";
        for (var i = 0; i < offers.length; i++) {
            cardsHtml = cardsHtml + "<div class='card'><div>";
            cardsHtml = cardsHtml + "<span class='badge-purple'>" + offers[i].discount_percent + "% OFF</span>";
            cardsHtml = cardsHtml + "<h3>" + offers[i].title + "</h3>";
            cardsHtml = cardsHtml + "<p>" + offers[i].description + "</p>";
            cardsHtml = cardsHtml + "</div></div>";
        }

        // Put the cards on the page
        offersList.innerHTML = cardsHtml;
    } catch (error) {
        console.log(error);
        offersList.innerHTML = "<p class='message message-error'>Cannot load the offers right now.</p>";
    }
}


// Run both functions when the page opens
loadFeaturedCoaches();
loadOffers();
