// Find the things we need on the page
var coachesList = document.getElementById("coachesList");
var coachMessage = document.getElementById("coachMessage");
var scheduleSection = document.getElementById("scheduleSection");
var scheduleTitle = document.getElementById("scheduleTitle");
var slotsList = document.getElementById("slotsList");
var bookingMessage = document.getElementById("bookingMessage");
var continueBar = document.getElementById("continueBar");
var continuePlanText = document.getElementById("continuePlanText");
var continueCoachText = document.getElementById("continueCoachText");

var fitnessPanel = document.getElementById("fitnessPanel");
var fitnessWeight = document.getElementById("fitnessWeight");
var fitnessHeight = document.getElementById("fitnessHeight");
var fitnessGoal = document.getElementById("fitnessGoal");
var fitnessExperience = document.getElementById("fitnessExperience");
var fitnessNotes = document.getElementById("fitnessNotes");
var bmiText = document.getElementById("bmiText");
var saveFitnessButton = document.getElementById("saveFitnessButton");
var skipFitnessButton = document.getElementById("skipFitnessButton");
var fitnessMessage = document.getElementById("fitnessMessage");

var reviewsSection = document.getElementById("reviewsSection");
var reviewsTitle = document.getElementById("reviewsTitle");
var ratingSummary = document.getElementById("ratingSummary");
var reviewsList = document.getElementById("reviewsList");
var reviewHint = document.getElementById("reviewHint");
var reviewFormPanel = document.getElementById("reviewFormPanel");
var reviewComment = document.getElementById("reviewComment");
var saveReviewButton = document.getElementById("saveReviewButton");
var deleteReviewButton = document.getElementById("deleteReviewButton");
var reviewMessage = document.getElementById("reviewMessage");
var starButtons = document.getElementsByClassName("star-button");

// We remember these things while the person uses the page
var coachesData = [];
var openCoachId = 0;
var openCoachName = "";
var pendingSlotId = null;
var chosenRating = 0;


// This function shows a message in the place we choose
function showMessage(messageElement, text, isError) {
    messageElement.textContent = text;

    if (isError) {
        messageElement.className = "message message-error";
    } else {
        messageElement.className = "message message-success";
    }
}


// This function shows the "Continue to Checkout" bar when a plan was chosen
function showContinueBar() {
    var planName = localStorage.getItem("selectedPlanName");
    var coachName = localStorage.getItem("selectedCoachName");

    // If no plan was chosen, we do not show the bar
    if (planName == null) {
        return;
    }

    continuePlanText.textContent = "Your plan: " + planName;

    if (coachName == null) {
        continueCoachText.textContent = "No coach selected yet (this step is optional)";
    } else {
        continueCoachText.textContent = "Your coach: " + coachName;
    }

    continueBar.classList.remove("hidden");
}


// This function builds the card of one coach
function makeCoachCard(coach) {
    // If the coach has no bio, show nothing
    var bioText = "";
    if (coach.bio != null) {
        bioText = escapeHtml(coach.bio);
    }

    var cardHtml = "<div class='card'><div>";
    cardHtml = cardHtml + "<span class='badge-purple'>" + escapeHtml(coach.specialization) + "</span>";
    cardHtml = cardHtml + "<h3>" + escapeHtml(coach.coach_name) + "</h3>";
    cardHtml = cardHtml + "<p class='coach-rating'>" + makeRatingText(coach.avg_rating, coach.review_count) + "</p>";
    cardHtml = cardHtml + "<p>" + coach.experience_years + " years of experience</p>";
    cardHtml = cardHtml + "<p>" + bioText + "</p>";
    cardHtml = cardHtml + "</div>";
    cardHtml = cardHtml + "<button class='btn select-coach-button' data-coach-id='" + coach.coach_id + "'>Select Coach, Schedule and Reviews</button>";
    cardHtml = cardHtml + "</div>";
    return cardHtml;
}


// This function puts the purple border on the card of the open coach
function highlightOpenCoach() {
    var buttons = document.getElementsByClassName("select-coach-button");

    for (var i = 0; i < buttons.length; i++) {
        if (buttons[i].getAttribute("data-coach-id") == openCoachId) {
            buttons[i].parentElement.classList.add("card-selected");
        }
    }
}


// This function runs when someone clicks "Select Coach"
function selectCoach(event) {
    // Find out which coach was clicked
    var coachId = event.currentTarget.getAttribute("data-coach-id");

    // Find the name of this coach in the coaches we loaded
    var coachName = "";
    for (var i = 0; i < coachesData.length; i++) {
        if (String(coachesData[i].coach_id) == coachId) {
            coachName = coachesData[i].coach_name;
        }
    }

    // Save the chosen coach in the browser
    localStorage.setItem("selectedCoachId", coachId);
    localStorage.setItem("selectedCoachName", coachName);
    showContinueBar();

    // Remove the purple border from every card, then add it to the chosen card
    var selectedCards = document.getElementsByClassName("card-selected");
    while (selectedCards.length > 0) {
        selectedCards[0].classList.remove("card-selected");
    }
    openCoachId = coachId;
    openCoachName = coachName;
    highlightOpenCoach();

    // Tell the person what they chose
    showMessage(coachMessage, "You selected " + coachName + ". You can also pick a session time below.", false);

    // Forget a booking that was waiting for the fitness questions
    pendingSlotId = null;
    fitnessPanel.classList.add("hidden");

    // Show the schedule and the reviews of this coach
    scheduleTitle.textContent = coachName + "'s Schedule";
    bookingMessage.textContent = "";
    scheduleSection.classList.remove("hidden");
    reviewsSection.classList.remove("hidden");
    loadSlots();
    loadReviews();
    scheduleSection.scrollIntoView();
}


// ----------------------------------------------------------------------
// Session times and booking
// ----------------------------------------------------------------------

// This function builds the card of one session time
function makeSlotCard(slot) {
    var cardHtml = "<div class='slot-card'>";
    cardHtml = cardHtml + "<h3>" + slot.slot_date + "</h3>";
    cardHtml = cardHtml + "<p>" + slot.slot_time + "</p>";

    if (slot.is_mine) {
        cardHtml = cardHtml + "<span class='badge-purple'>Booked by you</span>";
    } else if (slot.is_booked) {
        cardHtml = cardHtml + "<button class='btn btn-secondary' disabled>Already Booked</button>";
    } else {
        cardHtml = cardHtml + "<button class='btn book-button' data-slot-id='" + slot.slot_id + "'>Book This Time</button>";
    }

    cardHtml = cardHtml + "</div>";
    return cardHtml;
}


// This function runs when someone clicks "Book This Time"
async function startBooking(event) {
    var slotId = event.currentTarget.getAttribute("data-slot-id");

    try {
        // Ask the backend what it knows about this member
        var response = await fetch(backendAddress + "/api/fitness-profile", {
            credentials: "include"
        });

        // If the person is not logged in, send them to the login page
        if (response.status == 401) {
            showMessage(bookingMessage, "Please log in first. Taking you to the login page...", true);

            setTimeout(function () {
                window.location.href = "login.html";
            }, 1500);
            return;
        }

        var profile = await response.json();

        // Admins cannot book sessions
        if (response.status == 403) {
            showMessage(bookingMessage, "Only members can book sessions.", true);
            return;
        }

        // Members need an active membership
        if (profile.has_active_membership == false) {
            showMessage(bookingMessage, "You need an active membership to book sessions. Please choose a plan first.", true);
            return;
        }

        // If we never asked this member about their fitness, ask now (they can skip)
        if (profile.ask_now == true) {
            pendingSlotId = slotId;
            fitnessMessage.textContent = "";
            fitnessPanel.classList.remove("hidden");
            fitnessPanel.scrollIntoView();
            return;
        }

        // Otherwise book the time right away
        finishBooking(slotId);
    } catch (error) {
        console.log(error);
        showMessage(bookingMessage, "Cannot reach the server. Is python app.py running?", true);
    }
}


// This function books the session time
async function finishBooking(slotId) {
    try {
        // Ask the backend to book this time
        var response = await fetch(backendAddress + "/api/book-slot", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ slot_id: slotId })
        });
        var result = await response.json();

        // Show the answer from the backend
        if (response.ok) {
            showMessage(bookingMessage, result.message + " You can cancel it from My Bookings.", false);
        } else {
            showMessage(bookingMessage, result.message, true);
        }

        // Load the times again so the page shows the new status
        loadSlots();
    } catch (error) {
        console.log(error);
        showMessage(bookingMessage, "Cannot reach the server. Is python app.py running?", true);
    }
}


// This function makes every "Book This Time" button work
function connectBookButtons() {
    var buttons = document.getElementsByClassName("book-button");

    for (var i = 0; i < buttons.length; i++) {
        buttons[i].addEventListener("click", startBooking);
    }
}


// This function loads the session times of the open coach
async function loadSlots() {
    try {
        // Ask the backend for the times
        var response = await fetch(backendAddress + "/api/coaches/" + openCoachId + "/slots", {
            credentials: "include"
        });
        var slots = await response.json();

        // If there are no times, say so
        if (slots.length == 0) {
            slotsList.innerHTML = "<p class='message'>No sessions available for this coach yet.</p>";
            return;
        }

        // Build one card for each time
        var allSlotsHtml = "";
        for (var i = 0; i < slots.length; i++) {
            allSlotsHtml = allSlotsHtml + makeSlotCard(slots[i]);
        }

        // Put the cards on the page and connect the buttons
        slotsList.innerHTML = allSlotsHtml;
        connectBookButtons();
    } catch (error) {
        console.log(error);
        slotsList.innerHTML = "<p class='message message-error'>Cannot load the schedule right now.</p>";
    }
}


// ----------------------------------------------------------------------
// The optional fitness questions (weight, height, goal)
// ----------------------------------------------------------------------

// This function shows the BMI while the person types their weight and height
function updateBmiPreview() {
    var text = makeBmiText(fitnessWeight.value, fitnessHeight.value);

    if (text == "") {
        bmiText.textContent = "";
    } else {
        bmiText.textContent = text + " - this is only a rough guide.";
    }
}


// This function saves the answers (or the "skip") and then books the waiting session
async function sendFitness(skip) {
    var bodyObject = { skipped: true };

    // If the person answered, send the answers
    if (skip == false) {
        bodyObject = {
            skipped: false,
            weight_kg: fitnessWeight.value,
            height_cm: fitnessHeight.value,
            goal: fitnessGoal.value,
            experience: fitnessExperience.value,
            notes: fitnessNotes.value
        };
    }

    try {
        var response = await fetch(backendAddress + "/api/fitness-profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify(bodyObject)
        });
        var result = await response.json();

        if (response.ok == false) {
            showMessage(fitnessMessage, result.message, true);
            return;
        }

        // Close the questions and book the session that was waiting
        fitnessPanel.classList.add("hidden");
        var slotId = pendingSlotId;
        pendingSlotId = null;

        if (slotId != null) {
            finishBooking(slotId);
        }
    } catch (error) {
        console.log(error);
        showMessage(fitnessMessage, "Cannot reach the server. Is python app.py running?", true);
    }
}


// ----------------------------------------------------------------------
// Ratings and reviews
// ----------------------------------------------------------------------

// This function colors the stars of the review form
function setRating(value) {
    chosenRating = value;

    for (var i = 0; i < starButtons.length; i++) {
        var starValue = Number(starButtons[i].getAttribute("data-value"));

        if (starValue <= value) {
            starButtons[i].textContent = "\u2605";
            starButtons[i].classList.add("selected");
        } else {
            starButtons[i].textContent = "\u2606";
            starButtons[i].classList.remove("selected");
        }
    }
}


// This function makes the 5 stars of the review form work
function connectStarButtons() {
    for (var i = 0; i < starButtons.length; i++) {
        starButtons[i].addEventListener("click", function (event) {
            setRating(Number(event.currentTarget.getAttribute("data-value")));
        });
    }
}


// This function builds one review
function makeReviewRow(review) {
    var commentHtml = "";
    if (review.review_text != null) {
        commentHtml = "<p>" + escapeHtml(review.review_text) + "</p>";
    }

    var mineLabel = "";
    if (review.is_mine) {
        mineLabel = " <span class='badge-purple'>Your review</span>";
    }

    var rowHtml = "<div class='review-row'>";
    rowHtml = rowHtml + "<div class='review-head'>";
    rowHtml = rowHtml + "<strong>" + escapeHtml(review.reviewer) + "</strong>" + mineLabel;
    rowHtml = rowHtml + "<span class='coach-rating'>" + makeStars(review.rating) + "</span>";
    rowHtml = rowHtml + "<span class='review-date'>" + review.created_at + "</span>";
    rowHtml = rowHtml + "</div>" + commentHtml + "</div>";
    return rowHtml;
}


// This function decides if the review form is shown, and fills it
function showReviewForm(result) {
    reviewFormPanel.classList.add("hidden");
    reviewHint.className = "message";
    reviewHint.textContent = "";

    if (result.logged_in == false) {
        reviewHint.textContent = "Log in and book a session with this coach to leave a review.";
        return;
    }

    if (result.is_member == false) {
        reviewHint.textContent = "Only members can write reviews.";
        return;
    }

    if (result.can_review == false) {
        reviewHint.textContent = "You can review this coach after you book a session with them or choose them as your coach.";
        return;
    }

    // The person may write a review, so show the form
    reviewFormPanel.classList.remove("hidden");

    if (result.my_review != null) {
        // The person already reviewed this coach, so they can change it
        setRating(result.my_review.rating);
        reviewComment.value = result.my_review.review_text || "";
        saveReviewButton.textContent = "Update Review";
        deleteReviewButton.classList.remove("hidden");
    } else {
        setRating(0);
        reviewComment.value = "";
        saveReviewButton.textContent = "Submit Review";
        deleteReviewButton.classList.add("hidden");
    }
}


// This function loads the reviews of the open coach
async function loadReviews() {
    try {
        // Ask the backend for the reviews
        var response = await fetch(backendAddress + "/api/coaches/" + openCoachId + "/reviews", {
            credentials: "include"
        });
        var result = await response.json();

        reviewsTitle.textContent = "Reviews for " + openCoachName;

        // Show the average rating
        if (result.review_count == 0) {
            ratingSummary.innerHTML = "<p>No reviews yet. Be the first to review this coach!</p>";
        } else {
            var summaryHtml = "<div class='rating-summary'>";
            summaryHtml = summaryHtml + "<span class='rating-number'>" + result.avg_rating + "</span>";
            summaryHtml = summaryHtml + "<div><div class='coach-rating'>" + makeStars(result.avg_rating) + "</div>";
            summaryHtml = summaryHtml + "<p>" + result.review_count + " review(s)</p></div>";
            summaryHtml = summaryHtml + "</div>";
            ratingSummary.innerHTML = summaryHtml;
        }

        // Show every review
        var allReviewsHtml = "";
        for (var i = 0; i < result.reviews.length; i++) {
            allReviewsHtml = allReviewsHtml + makeReviewRow(result.reviews[i]);
        }
        reviewsList.innerHTML = allReviewsHtml;

        showReviewForm(result);
    } catch (error) {
        console.log(error);
        reviewsList.innerHTML = "<p class='message message-error'>Cannot load the reviews right now.</p>";
    }
}


// This function saves the review of the person
async function saveReview() {
    // The person must choose at least one star
    if (chosenRating == 0) {
        showMessage(reviewMessage, "Please choose a star rating first.", true);
        return;
    }

    try {
        var response = await fetch(backendAddress + "/api/coaches/" + openCoachId + "/reviews", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                rating: chosenRating,
                review_text: reviewComment.value
            })
        });
        var result = await response.json();

        if (response.ok) {
            await loadReviews();
            loadCoaches();
            showMessage(reviewMessage, result.message, false);
        } else {
            showMessage(reviewMessage, result.message, true);
        }
    } catch (error) {
        console.log(error);
        showMessage(reviewMessage, "Cannot reach the server. Is python app.py running?", true);
    }
}


// This function deletes the review of the person
async function deleteReview() {
    var sure = confirm("Delete your review?");
    if (sure == false) {
        return;
    }

    try {
        var response = await fetch(backendAddress + "/api/coaches/" + openCoachId + "/reviews", {
            method: "DELETE",
            credentials: "include"
        });
        var result = await response.json();

        if (response.ok) {
            await loadReviews();
            loadCoaches();
            showMessage(reviewMessage, result.message, false);
        } else {
            showMessage(reviewMessage, result.message, true);
        }
    } catch (error) {
        console.log(error);
        showMessage(reviewMessage, "Cannot reach the server. Is python app.py running?", true);
    }
}


// ----------------------------------------------------------------------
// The list of coaches
// ----------------------------------------------------------------------

// This function makes every "Select Coach" button work
function connectSelectButtons() {
    var buttons = document.getElementsByClassName("select-coach-button");

    for (var i = 0; i < buttons.length; i++) {
        buttons[i].addEventListener("click", selectCoach);
    }
}


// This function loads the coaches from the backend
async function loadCoaches() {
    try {
        // Ask the backend for the coaches
        var response = await fetch(backendAddress + "/api/coaches");
        var coaches = await response.json();
        coachesData = coaches;

        // Build one card for each coach
        var allCardsHtml = "";
        for (var i = 0; i < coaches.length; i++) {
            allCardsHtml = allCardsHtml + makeCoachCard(coaches[i]);
        }

        // Put the cards on the page and connect the buttons
        coachesList.innerHTML = allCardsHtml;
        connectSelectButtons();
        highlightOpenCoach();
    } catch (error) {
        console.log(error);
        coachesList.innerHTML = "<p class='message message-error'>Cannot load the coaches. Is python app.py running?</p>";
    }
}


// Connect the buttons and the typing boxes
saveFitnessButton.addEventListener("click", function () {
    sendFitness(false);
});
skipFitnessButton.addEventListener("click", function () {
    sendFitness(true);
});
fitnessWeight.addEventListener("input", updateBmiPreview);
fitnessHeight.addEventListener("input", updateBmiPreview);
saveReviewButton.addEventListener("click", saveReview);
deleteReviewButton.addEventListener("click", deleteReview);
connectStarButtons();

// Run these when the page opens
loadCoaches();
showContinueBar();
