// The name of the money we use (change it if you like)
var currencyName = "EGP";

// Find the things we need on the page
// We remember the plans we loaded
var plansData = [];

var plansList = document.getElementById("plansList");
var selectedMessage = document.getElementById("selectedMessage");


// This function turns the features text into a list with ticks
function makeFeaturesList(featuresText) {
    // If the plan has no features, show nothing
    if (featuresText == null) {
        return "";
    }

    var listHtml = "<ul class='plan-features'>";
    var features = featuresText.split(",");

    for (var i = 0; i < features.length; i++) {
        listHtml = listHtml + "<li>" + escapeHtml(features[i].trim()) + "</li>";
    }

    listHtml = listHtml + "</ul>";
    return listHtml;
}


// This function builds the card of one plan
function makePlanCard(plan) {
    var cardHtml = "<div class='card'><div>";
    cardHtml = cardHtml + "<span class='badge-purple'>" + plan.duration_months + " month(s)</span>";
    cardHtml = cardHtml + "<h3>" + escapeHtml(plan.plan_name) + "</h3>";
    cardHtml = cardHtml + "<div class='price-tag'>" + Number(plan.price) + " <span>" + currencyName + " total</span></div>";
    cardHtml = cardHtml + makeFeaturesList(plan.features);
    cardHtml = cardHtml + "</div>";
    cardHtml = cardHtml + "<button class='btn choose-button' data-plan-id='" + plan.plan_id + "'>Choose This Plan</button>";
    cardHtml = cardHtml + "</div>";
    return cardHtml;
}


// This function runs when someone clicks "Choose This Plan"
async function choosePlan(event) {
    // Find out which plan was clicked
    var button = event.currentTarget;
    var planId = button.getAttribute("data-plan-id");

    // Find the name of this plan in the plans we loaded
    var planName = "";
    for (var i = 0; i < plansData.length; i++) {
        if (String(plansData[i].plan_id) == planId) {
            planName = plansData[i].plan_name;
        }
    }

    // Ask the backend if the person is logged in
    var response = await fetch(backendAddress + "/api/me", {
        credentials: "include"
    });
    var result = await response.json();

    // If not logged in, send them to the login page
    if (result.logged_in == false) {
        selectedMessage.textContent = "Please log in first. Taking you to the login page...";
        selectedMessage.className = "message message-error";

        setTimeout(function () {
            window.location.href = "login.html";
        }, 1500);
        return;
    }

    // Admins cannot buy memberships
    if (result.role == "admin") {
        selectedMessage.textContent = "Admin accounts cannot buy memberships. Please use a member account.";
        selectedMessage.className = "message message-error";
        return;
    }

    // Save the chosen plan and forget any old coach choice
    localStorage.setItem("selectedPlanId", planId);
    localStorage.setItem("selectedPlanName", planName);
    localStorage.removeItem("selectedCoachId");
    localStorage.removeItem("selectedCoachName");

    // Go to step 2: choose a coach
    window.location.href = "coaches.html";
}


// This function makes every "Choose This Plan" button work
function connectChooseButtons() {
    var buttons = document.getElementsByClassName("choose-button");

    for (var i = 0; i < buttons.length; i++) {
        buttons[i].addEventListener("click", choosePlan);
    }
}


// This function loads the plans from the backend
async function loadPlans() {
    try {
        // Ask the backend for the plans
        var response = await fetch(backendAddress + "/api/plans");
        var plans = await response.json();
        plansData = plans;

        // Build one card for each plan
        var allCardsHtml = "";
        for (var i = 0; i < plans.length; i++) {
            allCardsHtml = allCardsHtml + makePlanCard(plans[i]);
        }

        // Put the cards on the page and connect the buttons
        plansList.innerHTML = allCardsHtml;
        connectChooseButtons();
    } catch (error) {
        console.log(error);
        plansList.innerHTML = "<p class='message message-error'>Cannot load the plans. Is python app.py running?</p>";
    }
}


// Run it when the page opens
loadPlans();
