// The name of the money we use (change it if you like)
var currencyName = "EGP";

// Find what the person chose on the earlier pages
var selectedPlanId = localStorage.getItem("selectedPlanId");
var selectedCoachId = localStorage.getItem("selectedCoachId");

// These numbers change while the person uses the page
var planPrice = 0;
var discountPercent = 0;
var promoCodeUsed = "";
var paymentMethod = "Card";

// Find the things we need on the page
var checkoutArea = document.getElementById("checkoutArea");
var receiptArea = document.getElementById("receiptArea");

var orderPlanName = document.getElementById("orderPlanName");
var orderPlanDetails = document.getElementById("orderPlanDetails");
var orderCoachName = document.getElementById("orderCoachName");
var orderCoachDetails = document.getElementById("orderCoachDetails");
var orderCoachLink = document.getElementById("orderCoachLink");

var promoInput = document.getElementById("promoInput");
var applyPromoButton = document.getElementById("applyPromoButton");
var promoMessage = document.getElementById("promoMessage");
var firstOrderBanner = document.getElementById("firstOrderBanner");
var applyFirstOrderButton = document.getElementById("applyFirstOrderButton");

var cardMethodButton = document.getElementById("cardMethodButton");
var walletMethodButton = document.getElementById("walletMethodButton");
var cardFields = document.getElementById("cardFields");
var walletNote = document.getElementById("walletNote");
var cardNameInput = document.getElementById("cardNameInput");
var cardNumberInput = document.getElementById("cardNumberInput");
var cardExpiryInput = document.getElementById("cardExpiryInput");
var cardCvvInput = document.getElementById("cardCvvInput");
var payButton = document.getElementById("payButton");
var payMessage = document.getElementById("payMessage");

var summaryPrice = document.getElementById("summaryPrice");
var summaryDiscountLabel = document.getElementById("summaryDiscountLabel");
var summaryDiscount = document.getElementById("summaryDiscount");
var summaryTotal = document.getElementById("summaryTotal");

var stepPayment = document.getElementById("stepPayment");
var stepDone = document.getElementById("stepDone");


// This function shows a message in the place we choose
function showMessage(messageElement, text, isError) {
    messageElement.textContent = text;

    if (isError) {
        messageElement.className = "message message-error";
    } else {
        messageElement.className = "message message-success";
    }
}


// This function keeps only the digits of a text
function keepOnlyDigits(text) {
    var digits = "";

    for (var i = 0; i < text.length; i++) {
        if ("0123456789".indexOf(text.charAt(i)) >= 0) {
            digits = digits + text.charAt(i);
        }
    }

    return digits;
}


// This function writes the card number in groups of 4 digits
function formatCardNumber() {
    var digits = keepOnlyDigits(cardNumberInput.value);
    var formatted = "";

    for (var i = 0; i < digits.length && i < 16; i++) {
        if (i > 0 && i % 4 == 0) {
            formatted = formatted + " ";
        }
        formatted = formatted + digits.charAt(i);
    }

    cardNumberInput.value = formatted;
}


// This function writes the expiry date like 08/28
function formatExpiry() {
    var digits = keepOnlyDigits(cardExpiryInput.value);

    if (digits.length > 4) {
        digits = digits.substring(0, 4);
    }

    if (digits.length > 2) {
        cardExpiryInput.value = digits.substring(0, 2) + "/" + digits.substring(2);
    } else {
        cardExpiryInput.value = digits;
    }
}


// This function updates the prices in the summary box
function updateSummary() {
    var discountAmount = Math.round(planPrice * discountPercent) / 100;
    var total = planPrice - discountAmount;

    summaryPrice.textContent = planPrice + " " + currencyName;
    summaryTotal.textContent = total + " " + currencyName;

    if (discountPercent > 0) {
        summaryDiscountLabel.textContent = "Discount (" + discountPercent + "%)";
        summaryDiscount.textContent = "-" + discountAmount + " " + currencyName;
    } else {
        summaryDiscountLabel.textContent = "Discount";
        summaryDiscount.textContent = "-0 " + currencyName;
    }
}


// This function finds the chosen plan and shows it
async function loadPlan() {
    var response = await fetch(backendAddress + "/api/plans");
    var plans = await response.json();

    for (var i = 0; i < plans.length; i++) {
        if (Number(plans[i].plan_id) == Number(selectedPlanId)) {
            planPrice = Number(plans[i].price);
            orderPlanName.textContent = plans[i].plan_name + " Plan";
            orderPlanDetails.textContent = plans[i].duration_months + " month(s) - " + planPrice + " " + currencyName;
            return true;
        }
    }

    // If the plan was not found, we cannot continue
    return false;
}


// This function finds the chosen coach and shows it
async function loadCoach() {
    // If no coach was chosen, say so
    if (selectedCoachId == null) {
        orderCoachName.textContent = "No coach selected";
        orderCoachDetails.textContent = "You can still book sessions later.";
        orderCoachLink.textContent = "Choose";
        return;
    }

    var response = await fetch(backendAddress + "/api/coaches");
    var coaches = await response.json();

    for (var i = 0; i < coaches.length; i++) {
        if (Number(coaches[i].coach_id) == Number(selectedCoachId)) {
            orderCoachName.textContent = coaches[i].coach_name;
            orderCoachDetails.textContent = coaches[i].specialization;
            orderCoachLink.textContent = "Change";
        }
    }
}


// This function checks the promo code the person typed
async function applyPromo() {
    var code = promoInput.value.trim();

    if (code == "") {
        showMessage(promoMessage, "Please type a promo code first.", true);
        return;
    }

    try {
        // Ask the backend if the code is good
        var response = await fetch(backendAddress + "/api/check-promo", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ promo_code: code })
        });
        var result = await response.json();

        if (response.ok) {
            discountPercent = result.discount_percent;
            promoCodeUsed = code.toUpperCase();
            showMessage(promoMessage, result.message, false);
        } else {
            discountPercent = 0;
            promoCodeUsed = "";
            showMessage(promoMessage, result.message, true);
        }

        updateSummary();
    } catch (error) {
        console.log(error);
        showMessage(promoMessage, "Cannot reach the server. Is python app.py running?", true);
    }
}


// This function selects the card payment method
function chooseCardMethod() {
    paymentMethod = "Card";
    cardMethodButton.classList.add("selected");
    walletMethodButton.classList.remove("selected");
    cardFields.classList.remove("hidden");
    walletNote.classList.add("hidden");
}


// This function selects the mobile wallet payment method
function chooseWalletMethod() {
    paymentMethod = "Mobile Wallet";
    walletMethodButton.classList.add("selected");
    cardMethodButton.classList.remove("selected");
    walletNote.classList.remove("hidden");
    cardFields.classList.add("hidden");
}


// This function checks the card details one by one
function checkCardFields() {
    var cardName = cardNameInput.value.trim();
    var cardDigits = keepOnlyDigits(cardNumberInput.value);
    var expiry = cardExpiryInput.value;
    var cvv = keepOnlyDigits(cardCvvInput.value);

    if (cardName == "") {
        showMessage(payMessage, "Please type the name on the card.", true);
        return false;
    }

    if (cardDigits.length != 16) {
        showMessage(payMessage, "The card number must have 16 digits.", true);
        return false;
    }

    if (expiry.length != 5 || expiry.charAt(2) != "/") {
        showMessage(payMessage, "Please type the expiry date like 08/28.", true);
        return false;
    }

    var month = Number(expiry.substring(0, 2));
    var year = Number(expiry.substring(3, 5));

    if (isNaN(month) || isNaN(year) || month < 1 || month > 12) {
        showMessage(payMessage, "The expiry date is not valid.", true);
        return false;
    }

    // Check that the card is not expired
    var today = new Date();
    var thisYear = today.getFullYear() - 2000;
    var thisMonth = today.getMonth() + 1;

    if (year < thisYear || (year == thisYear && month < thisMonth)) {
        showMessage(payMessage, "This card has expired.", true);
        return false;
    }

    if (cvv.length != 3) {
        showMessage(payMessage, "The security code (CVV) must have 3 digits.", true);
        return false;
    }

    return true;
}


// This function shows the receipt after a successful payment
function showReceipt(result) {
    // Fill in the receipt
    document.getElementById("receiptNumber").textContent = "#" + result.receipt_number;
    document.getElementById("receiptPlan").textContent = result.plan_name;
    document.getElementById("receiptCoach").textContent = result.coach_name;
    document.getElementById("receiptDates").textContent = result.start_date + " to " + result.end_date;
    document.getElementById("receiptAmount").textContent = result.amount + " " + currencyName;

    // Hide the checkout and show the receipt
    checkoutArea.classList.add("hidden");
    receiptArea.classList.remove("hidden");

    // Update the steps at the top
    stepPayment.classList.remove("active");
    stepPayment.classList.add("done");
    stepDone.classList.add("active");

    // Forget the choices we saved
    localStorage.removeItem("selectedPlanId");
    localStorage.removeItem("selectedPlanName");
    localStorage.removeItem("selectedCoachId");
    localStorage.removeItem("selectedCoachName");

    window.scrollTo(0, 0);
}


// This function sends the payment to the backend
async function payNow() {
    // Check the card details first
    if (paymentMethod == "Card") {
        var cardIsOk = checkCardFields();
        if (cardIsOk == false) {
            return;
        }
    }

    // Stop the person from clicking twice
    payButton.disabled = true;
    payButton.textContent = "Processing...";
    payMessage.textContent = "";

    try {
        // Send the order to the backend
        var response = await fetch(backendAddress + "/api/checkout", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                plan_id: selectedPlanId,
                coach_id: selectedCoachId,
                promo_code: promoCodeUsed,
                payment_method: paymentMethod,
                card_number: cardNumberInput.value
            })
        });
        var result = await response.json();

        if (response.ok) {
            showReceipt(result);
        } else {
            showMessage(payMessage, result.message, true);
        }
    } catch (error) {
        console.log(error);
        showMessage(payMessage, "Cannot reach the server. Is python app.py running?", true);
    }

    payButton.disabled = false;
    payButton.textContent = "Pay Now";
}


// This function starts the page
async function startCheckout() {
    // Check that someone is logged in
    var response = await fetch(backendAddress + "/api/me", {
        credentials: "include"
    });
    var result = await response.json();

    if (result.logged_in == false) {
        window.location.href = "login.html";
        return;
    }

    // Admins do not buy memberships
    if (result.role == "admin") {
        window.location.href = "admin.html";
        return;
    }

    // If no plan was chosen, go back to the plans page
    if (selectedPlanId == null) {
        window.location.href = "plans.html";
        return;
    }

    var planWasFound = await loadPlan();
    if (planWasFound == false) {
        window.location.href = "plans.html";
        return;
    }

    await loadCoach();
    updateSummary();
}


// Connect the buttons and the typing boxes
applyPromoButton.addEventListener("click", applyPromo);


// This function types the suggested first-order code for the person and applies it
function applyFirstOrderCode() {
    promoInput.value = firstOrderBanner.getAttribute("data-code");
    applyPromo();
}

applyFirstOrderButton.addEventListener("click", applyFirstOrderCode);
cardMethodButton.addEventListener("click", chooseCardMethod);
walletMethodButton.addEventListener("click", chooseWalletMethod);
cardNumberInput.addEventListener("input", formatCardNumber);
cardExpiryInput.addEventListener("input", formatExpiry);
payButton.addEventListener("click", payNow);

// Run it when the page opens
startCheckout();
