// The name of the money we use (change it if you like)
var currencyName = "EGP";

// Find the things we need on the page
var avatarLetter = document.getElementById("avatarLetter");
var sideName = document.getElementById("sideName");
var sideEmail = document.getElementById("sideEmail");
var greetingText = document.getElementById("greetingText");

var membershipStat = document.getElementById("membershipStat");
var daysLeftStat = document.getElementById("daysLeftStat");
var upcomingCount = document.getElementById("upcomingCount");
var activeMembershipPanel = document.getElementById("activeMembershipPanel");
var activeMembershipDetails = document.getElementById("activeMembershipDetails");
var getStartedPanel = document.getElementById("getStartedPanel");

var membershipsList = document.getElementById("membershipsList");
var membershipMessage = document.getElementById("membershipMessage");
var bookingsList = document.getElementById("bookingsList");
var bookingsMessage = document.getElementById("bookingsMessage");
var paymentsList = document.getElementById("paymentsList");

var fitnessWeight = document.getElementById("fitnessWeight");
var fitnessHeight = document.getElementById("fitnessHeight");
var fitnessGoal = document.getElementById("fitnessGoal");
var fitnessExperience = document.getElementById("fitnessExperience");
var fitnessNotes = document.getElementById("fitnessNotes");
var bmiText = document.getElementById("bmiText");
var saveFitnessProfileButton = document.getElementById("saveFitnessProfileButton");
var fitnessProfileMessage = document.getElementById("fitnessProfileMessage");

var nameInput = document.getElementById("nameInput");
var emailInput = document.getElementById("emailInput");
var saveProfileButton = document.getElementById("saveProfileButton");
var profileMessage = document.getElementById("profileMessage");

var currentPasswordInput = document.getElementById("currentPasswordInput");
var newPasswordInput = document.getElementById("newPasswordInput");
var confirmPasswordInput = document.getElementById("confirmPasswordInput");
var changePasswordButton = document.getElementById("changePasswordButton");
var passwordMessage = document.getElementById("passwordMessage");

var logoutButton = document.getElementById("logoutButton");
var sideLinks = document.getElementsByClassName("side-link");
var dashboardSections = document.getElementsByClassName("dashboard-section");


// This function shows a message in the place we choose
function showMessage(messageElement, text, isError) {
    messageElement.textContent = text;

    if (isError) {
        messageElement.className = "message message-error";
    } else {
        messageElement.className = "message message-success";
    }
}


// This function shows one section and hides the others
function showSection(sectionId) {
    // Hide every section
    for (var i = 0; i < dashboardSections.length; i++) {
        dashboardSections[i].classList.add("hidden");
    }

    // Show the section we want
    document.getElementById(sectionId).classList.remove("hidden");

    // Mark the matching menu button as active
    for (var j = 0; j < sideLinks.length; j++) {
        sideLinks[j].classList.remove("active");

        if (sideLinks[j].getAttribute("data-section") == sectionId) {
            sideLinks[j].classList.add("active");
        }
    }
}


// This function makes the menu buttons on the left work
function connectSideLinks() {
    for (var i = 0; i < sideLinks.length; i++) {
        var sectionName = sideLinks[i].getAttribute("data-section");

        // The Log Out button has no section, so we skip it
        if (sectionName != null) {
            sideLinks[i].addEventListener("click", function (event) {
                showSection(event.currentTarget.getAttribute("data-section"));
            });
        }
    }
}


// This function opens the right section if the address ends with #bookings, #profile and so on
function openSectionFromAddress() {
    var addressEnd = window.location.hash.replace("#", "");

    if (addressEnd == "") {
        return;
    }

    var section = document.getElementById(addressEnd + "Section");
    if (section != null) {
        showSection(section.id);
    }
}


// This function checks that a member is logged in
async function checkLogin() {
    var response = await fetch(backendAddress + "/api/me", {
        credentials: "include"
    });
    var result = await response.json();

    // If nobody is logged in, go to the login page
    if (result.logged_in == false) {
        window.location.href = "login.html";
        return false;
    }

    // The admin has his own panel
    if (result.role == "admin") {
        window.location.href = "admin.html";
        return false;
    }

    return true;
}


// This function loads the name and email of the person
async function loadProfile() {
    var response = await fetch(backendAddress + "/api/profile", {
        credentials: "include"
    });
    var profile = await response.json();

    // Fill the greeting and the left side
    var firstName = profile.full_name.split(" ")[0];
    greetingText.textContent = "Hello, " + firstName + "!";
    sideName.textContent = profile.full_name;
    sideEmail.textContent = profile.email;
    avatarLetter.textContent = profile.full_name.charAt(0).toUpperCase();

    // Fill the profile form
    nameInput.value = profile.full_name;
    emailInput.value = profile.email;
}


// This function makes the colored label of a status
function makeStatusBadge(status) {
    if (status == "active") {
        return "<span class='badge-green'>Active</span>";
    }

    if (status == "paid") {
        return "<span class='badge-green'>Paid</span>";
    }

    // Anything else (expired, cancelled, failed) gets the gray label
    return "<span class='badge-gray'>" + status + "</span>";
}


// This function builds one membership row
function makeMembershipRow(membership) {
    var coachText = "No coach";
    if (membership.coach_name != null) {
        coachText = "Coach: " + escapeHtml(membership.coach_name);
    }

    var rowHtml = "<div class='booking-row'>";
    rowHtml = rowHtml + "<div class='booking-info'>";
    rowHtml = rowHtml + "<h3>" + escapeHtml(membership.plan_name) + " Plan</h3>";
    rowHtml = rowHtml + "<p>" + coachText + "</p>";
    rowHtml = rowHtml + "<p>" + membership.start_date + " to " + membership.end_date + "</p>";

    // If this membership was cancelled and refunded, say how much
    if (membership.refund_amount != null) {
        rowHtml = rowHtml + "<p>Refunded: " + membership.refund_amount + " " + currencyName + "</p>";
    }

    rowHtml = rowHtml + "</div>";
    rowHtml = rowHtml + "<div class='booking-actions'>" + makeStatusBadge(membership.current_status);

    // Only an active membership can be cancelled
    if (membership.current_status == "active") {
        rowHtml = rowHtml + "<button class='btn btn-danger btn-small cancel-membership-button' data-membership-id='" + membership.membership_id + "' data-refund='" + membership.refund_estimate + "'>Cancel Membership</button>";
    }

    rowHtml = rowHtml + "</div>";
    rowHtml = rowHtml + "</div>";
    return rowHtml;
}


// This function runs when someone clicks "Cancel Membership"
async function cancelMembership(event) {
    var button = event.currentTarget;
    var membershipId = button.getAttribute("data-membership-id");
    var refund = button.getAttribute("data-refund");

    // Tell the person about the refund and ask to make sure
    var sure = confirm("Cancel your membership? You will get a refund of " + refund + " " + currencyName + " for the unused days, and your upcoming sessions will be cancelled.");
    if (sure == false) {
        return;
    }

    try {
        // Ask the backend to cancel the membership
        var response = await fetch(backendAddress + "/api/cancel-membership", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ membership_id: membershipId })
        });
        var result = await response.json();

        // Load everything again so the page shows the new situation
        await loadMemberships();
        loadPayments();
        loadBookings();

        if (response.ok) {
            showMessage(membershipMessage, result.message, false);
        } else {
            showMessage(membershipMessage, result.message, true);
        }
    } catch (error) {
        console.log(error);
        showMessage(membershipMessage, "Cannot reach the server. Is python app.py running?", true);
    }
}


// This function makes every "Cancel Membership" button work
function connectCancelMembershipButtons() {
    var buttons = document.getElementsByClassName("cancel-membership-button");

    for (var i = 0; i < buttons.length; i++) {
        buttons[i].addEventListener("click", cancelMembership);
    }
}


// This function loads the memberships of the person
async function loadMemberships() {
    try {
        // Ask the backend for the memberships
        var response = await fetch(backendAddress + "/api/my-memberships", {
            credentials: "include"
        });
        var memberships = await response.json();

        // Start with an empty overview (it is filled again below if there is an active membership)
        membershipStat.textContent = "None yet";
        daysLeftStat.textContent = "-";
        activeMembershipPanel.classList.add("hidden");
        getStartedPanel.classList.remove("hidden");

        // If there are none, show a friendly message
        if (memberships.length == 0) {
            membershipsList.innerHTML = "<div class='empty-state'><p>You do not have a membership yet.</p><a href='plans.html' class='btn btn-small'>Browse Plans</a></div>";
            return;
        }

        // Build one row for each membership and look for the active one
        var allRowsHtml = "";
        var activeMembership = null;

        for (var i = 0; i < memberships.length; i++) {
            allRowsHtml = allRowsHtml + makeMembershipRow(memberships[i]);

            if (memberships[i].current_status == "active" && activeMembership == null) {
                activeMembership = memberships[i];
            }
        }

        membershipsList.innerHTML = allRowsHtml;
        connectCancelMembershipButtons();

        // If there is an active membership, show it on the overview
        if (activeMembership != null) {
            var coachText = "No coach";
            if (activeMembership.coach_name != null) {
                coachText = escapeHtml(activeMembership.coach_name);
            }

            membershipStat.textContent = activeMembership.plan_name;
            daysLeftStat.textContent = activeMembership.days_left;

            var detailsHtml = "<div class='summary-row'><span>Plan</span><span>" + escapeHtml(activeMembership.plan_name) + "</span></div>";
            detailsHtml = detailsHtml + "<div class='summary-row'><span>Coach</span><span>" + coachText + "</span></div>";
            detailsHtml = detailsHtml + "<div class='summary-row'><span>Started</span><span>" + activeMembership.start_date + "</span></div>";
            detailsHtml = detailsHtml + "<div class='summary-row'><span>Expires</span><span>" + activeMembership.end_date + "</span></div>";
            activeMembershipDetails.innerHTML = detailsHtml;

            activeMembershipPanel.classList.remove("hidden");
            getStartedPanel.classList.add("hidden");
        }
    } catch (error) {
        console.log(error);
        membershipsList.innerHTML = "<p class='message message-error'>Cannot load your memberships right now.</p>";
    }
}


// This function builds one payment row
function makePaymentRow(payment) {
    var rowHtml = "<div class='booking-row'>";
    rowHtml = rowHtml + "<div class='booking-info'>";
    rowHtml = rowHtml + "<h3>" + escapeHtml(payment.plan_name) + " Plan - Receipt #" + payment.payment_id + "</h3>";
    rowHtml = rowHtml + "<p>" + payment.payment_date + " - " + payment.payment_method + "</p>";

    // If this payment was refunded, say how much
    if (payment.refund_amount != null) {
        rowHtml = rowHtml + "<p>Refunded: " + payment.refund_amount + " " + currencyName + "</p>";
    }

    rowHtml = rowHtml + "</div>";
    rowHtml = rowHtml + "<div class='booking-actions'>";
    rowHtml = rowHtml + "<strong>" + payment.amount + " " + currencyName + "</strong>";
    rowHtml = rowHtml + makeStatusBadge(payment.payment_status);
    rowHtml = rowHtml + "</div></div>";
    return rowHtml;
}


// This function loads the payments of the person
async function loadPayments() {
    try {
        // Ask the backend for the payments
        var response = await fetch(backendAddress + "/api/my-payments", {
            credentials: "include"
        });
        var payments = await response.json();

        // If there are none, show a friendly message
        if (payments.length == 0) {
            paymentsList.innerHTML = "<div class='empty-state'><p>You have no payments yet.</p></div>";
            return;
        }

        // Build one row for each payment
        var allRowsHtml = "";
        for (var i = 0; i < payments.length; i++) {
            allRowsHtml = allRowsHtml + makePaymentRow(payments[i]);
        }

        paymentsList.innerHTML = allRowsHtml;
    } catch (error) {
        console.log(error);
        paymentsList.innerHTML = "<p class='message message-error'>Cannot load your payments right now.</p>";
    }
}


// This function builds one booking row
function makeBookingRow(booking) {
    var rowHtml = "<div class='booking-row'>";
    rowHtml = rowHtml + "<div class='booking-info'>";
    rowHtml = rowHtml + "<h3>" + escapeHtml(booking.coach_name) + "</h3>";
    rowHtml = rowHtml + "<p>" + escapeHtml(booking.specialization) + "</p>";
    rowHtml = rowHtml + "<p>" + booking.slot_date + " at " + booking.slot_time + "</p>";
    rowHtml = rowHtml + "</div>";
    rowHtml = rowHtml + "<div class='booking-actions'>";

    if (booking.is_upcoming) {
        rowHtml = rowHtml + "<span class='badge-green'>Upcoming</span>";
        rowHtml = rowHtml + "<button class='btn btn-danger btn-small cancel-button' data-slot-id='" + booking.slot_id + "'>Cancel</button>";
    } else {
        rowHtml = rowHtml + "<span class='badge-gray'>Completed</span>";
    }

    rowHtml = rowHtml + "</div></div>";
    return rowHtml;
}


// This function runs when someone clicks "Cancel"
async function cancelBooking(event) {
    var slotId = event.currentTarget.getAttribute("data-slot-id");

    // Ask the person to make sure
    var sure = confirm("Do you really want to cancel this session?");
    if (sure == false) {
        return;
    }

    try {
        // Ask the backend to cancel the booking
        var response = await fetch(backendAddress + "/api/cancel-booking", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ slot_id: slotId })
        });
        var result = await response.json();

        // Load the bookings again, then show the answer
        await loadBookings();

        if (response.ok) {
            showMessage(bookingsMessage, result.message, false);
        } else {
            showMessage(bookingsMessage, result.message, true);
        }
    } catch (error) {
        console.log(error);
        showMessage(bookingsMessage, "Cannot reach the server. Is python app.py running?", true);
    }
}


// This function makes every "Cancel" button work
function connectCancelButtons() {
    var buttons = document.getElementsByClassName("cancel-button");

    for (var i = 0; i < buttons.length; i++) {
        buttons[i].addEventListener("click", cancelBooking);
    }
}


// This function loads the bookings of the person
async function loadBookings() {
    try {
        // Ask the backend for the bookings
        var response = await fetch(backendAddress + "/api/my-bookings", {
            credentials: "include"
        });
        var bookings = await response.json();

        // If there are no bookings, show a friendly message
        if (bookings.length == 0) {
            bookingsList.innerHTML = "<div class='empty-state'><p>You have no sessions booked yet.</p><a href='coaches.html' class='btn btn-small'>Book a Session</a></div>";
            upcomingCount.textContent = "0";
            return;
        }

        // Build one row for each booking and count the upcoming ones
        var allRowsHtml = "";
        var upcomingTotal = 0;

        for (var i = 0; i < bookings.length; i++) {
            allRowsHtml = allRowsHtml + makeBookingRow(bookings[i]);

            if (bookings[i].is_upcoming) {
                upcomingTotal = upcomingTotal + 1;
            }
        }

        // Put the rows on the page and connect the buttons
        bookingsList.innerHTML = allRowsHtml;
        upcomingCount.textContent = upcomingTotal;
        connectCancelButtons();
    } catch (error) {
        console.log(error);
        bookingsList.innerHTML = "<p class='message message-error'>Cannot load your bookings right now.</p>";
    }
}


// This function saves the new name and email
async function saveProfile() {
    var fullName = nameInput.value;
    var email = emailInput.value;

    // Stop if something is empty
    if (fullName == "" || email == "") {
        showMessage(profileMessage, "Please fill in your name and email.", true);
        return;
    }

    try {
        // Send the new details to the backend
        var response = await fetch(backendAddress + "/api/update-profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ full_name: fullName, email: email })
        });
        var result = await response.json();

        if (response.ok) {
            showMessage(profileMessage, result.message, false);
            loadProfile();
        } else {
            showMessage(profileMessage, result.message, true);
        }
    } catch (error) {
        console.log(error);
        showMessage(profileMessage, "Cannot reach the server. Is python app.py running?", true);
    }
}


// This function changes the password
async function changePassword() {
    var currentPassword = currentPasswordInput.value;
    var newPassword = newPasswordInput.value;
    var confirmPassword = confirmPasswordInput.value;

    // Stop if something is empty
    if (currentPassword == "" || newPassword == "") {
        showMessage(passwordMessage, "Please fill in all the fields.", true);
        return;
    }

    // Stop if the two new passwords are different
    if (newPassword != confirmPassword) {
        showMessage(passwordMessage, "The two new passwords do not match.", true);
        return;
    }

    try {
        // Send the passwords to the backend
        var response = await fetch(backendAddress + "/api/change-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                current_password: currentPassword,
                new_password: newPassword
            })
        });
        var result = await response.json();

        if (response.ok) {
            showMessage(passwordMessage, result.message, false);
            currentPasswordInput.value = "";
            newPasswordInput.value = "";
            confirmPasswordInput.value = "";
        } else {
            showMessage(passwordMessage, result.message, true);
        }
    } catch (error) {
        console.log(error);
        showMessage(passwordMessage, "Cannot reach the server. Is python app.py running?", true);
    }
}


// This function shows the BMI while the person types their weight and height
function updateBmiPreview() {
    var text = makeBmiText(fitnessWeight.value, fitnessHeight.value);

    if (text == "") {
        bmiText.textContent = "";
    } else {
        bmiText.textContent = text + " - this is only a rough guide.";
    }
}


// This function loads the fitness profile of the person
async function loadFitnessProfile() {
    try {
        var response = await fetch(backendAddress + "/api/fitness-profile", {
            credentials: "include"
        });
        var profile = await response.json();

        // Fill the form with what we know (empty boxes if we know nothing)
        fitnessWeight.value = profile.weight_kg || "";
        fitnessHeight.value = profile.height_cm || "";
        fitnessGoal.value = profile.goal || "";
        fitnessExperience.value = profile.experience || "";
        fitnessNotes.value = profile.notes || "";
        updateBmiPreview();
    } catch (error) {
        console.log(error);
    }
}


// This function saves the fitness profile
async function saveFitnessProfile() {
    try {
        var response = await fetch(backendAddress + "/api/fitness-profile", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({
                skipped: false,
                weight_kg: fitnessWeight.value,
                height_cm: fitnessHeight.value,
                goal: fitnessGoal.value,
                experience: fitnessExperience.value,
                notes: fitnessNotes.value
            })
        });
        var result = await response.json();

        if (response.ok) {
            showMessage(fitnessProfileMessage, result.message, false);
        } else {
            showMessage(fitnessProfileMessage, result.message, true);
        }
    } catch (error) {
        console.log(error);
        showMessage(fitnessProfileMessage, "Cannot reach the server. Is python app.py running?", true);
    }
}


// This function starts the page
async function startDashboard() {
    var isMemberLoggedIn = await checkLogin();

    // If nobody is logged in, checkLogin already sent them away
    if (isMemberLoggedIn == false) {
        return;
    }

    connectSideLinks();
    loadProfile();
    loadMemberships();
    loadBookings();
    loadPayments();
    loadFitnessProfile();
    openSectionFromAddress();
}


// Connect the buttons
saveProfileButton.addEventListener("click", saveProfile);
changePasswordButton.addEventListener("click", changePassword);
saveFitnessProfileButton.addEventListener("click", saveFitnessProfile);
fitnessWeight.addEventListener("input", updateBmiPreview);
fitnessHeight.addEventListener("input", updateBmiPreview);
logoutButton.addEventListener("click", logoutUser);

// Run it when the page opens
startDashboard();
