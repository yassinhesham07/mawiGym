// The name of the money we use (change it if you like)
var currencyName = "EGP";

// For each thing the admin can manage we list its details here.
// "fields" are the boxes of the form, "columns" are the columns of the table.
var resources = {
    members: {
        url: "/api/admin/members",
        idField: "user_id",
        fields: ["full_name", "email", "password"],
        columns: ["full_name", "email", "active_plan", "created_at"],
        addTitle: "Add a Member",
        editTitle: "Edit Member",
        addLabel: "Add Member",
        editLabel: "Save Changes",
        deleteWarning: "Delete this member? Their memberships, payments and bookings will be deleted too."
    },
    coaches: {
        url: "/api/admin/data/coaches",
        idField: "coach_id",
        fields: ["coach_name", "specialization", "experience_years", "bio"],
        columns: ["coach_name", "specialization", "experience_years"],
        addTitle: "Add a Coach",
        editTitle: "Edit Coach",
        addLabel: "Add Coach",
        editLabel: "Save Changes",
        deleteWarning: "Delete this coach? Their session times will be deleted too."
    },
    plans: {
        url: "/api/admin/data/plans",
        idField: "plan_id",
        fields: ["plan_name", "duration_months", "price", "features"],
        columns: ["plan_name", "duration_months", "price", "features"],
        addTitle: "Add a Plan",
        editTitle: "Edit Plan",
        addLabel: "Add Plan",
        editLabel: "Save Changes",
        deleteWarning: "Delete this plan?"
    },
    offers: {
        url: "/api/admin/data/offers",
        idField: "offer_id",
        fields: ["title", "description", "discount_percent", "promo_code", "end_date", "first_order_only"],
        columns: ["title", "discount_percent", "promo_code", "end_date", "first_order_only"],
        addTitle: "Add an Offer",
        editTitle: "Edit Offer",
        addLabel: "Add Offer",
        editLabel: "Save Changes",
        deleteWarning: "Delete this offer?"
    }
};

// The rows we loaded from the backend, and which row is being edited
var resourceRows = {};
var editingIds = {};
var slotRows = [];
var membershipRows = [];

// Some columns need special care when we show them
var checkboxFields = ["first_order_only"];
var moneyColumns = ["price", "paid_amount", "amount", "refund_amount"];
var statusColumns = ["current_status", "payment_status", "when_text"];
var goodStatuses = ["active", "paid", "Upcoming"];

// Find the things we need on the page
var sideLinks = document.getElementsByClassName("side-link");
var dashboardSections = document.getElementsByClassName("dashboard-section");
var adminLogoutButton = document.getElementById("adminLogoutButton");
var sideLogoutButton = document.getElementById("sideLogoutButton");


// This function decides how one value looks inside a table
function formatCell(columnName, value) {
    // Empty values show a dash
    if (value === null || value === undefined || value === "") {
        return "-";
    }

    if (checkboxFields.indexOf(columnName) >= 0) {
        if (value == 1) {
            return "Yes";
        }
        return "No";
    }

    if (columnName == "rating") {
        return makeStars(value) + " " + escapeHtml(value);
    }

    if (moneyColumns.indexOf(columnName) >= 0) {
        return escapeHtml(value) + " " + currencyName;
    }

    if (statusColumns.indexOf(columnName) >= 0) {
        if (goodStatuses.indexOf(value) >= 0) {
            return "<span class='badge-green'>" + escapeHtml(value) + "</span>";
        }
        return "<span class='badge-gray'>" + escapeHtml(value) + "</span>";
    }

    return escapeHtml(String(value));
}


// This function builds the cells of one table row
function makeCells(row, columns) {
    var cellsHtml = "";

    for (var i = 0; i < columns.length; i++) {
        cellsHtml = cellsHtml + "<td>" + formatCell(columns[i], row[columns[i]]) + "</td>";
    }

    return cellsHtml;
}


// This function builds a table row that says there is nothing to show
function makeEmptyRow(columnCount, text) {
    return "<tr><td class='table-empty' colspan='" + columnCount + "'>" + text + "</td></tr>";
}


// This function shows a message under a form or a table
function showMessage(name, text, isError) {
    var messageElement = document.getElementById(name + "_message");

    // If there is no message place for this name, stop here
    if (messageElement == null) {
        return;
    }

    messageElement.textContent = text;

    if (isError) {
        messageElement.className = "message message-error";
    } else {
        messageElement.className = "message message-success";
    }
}


// This function makes all buttons of one kind call the same function
function connectButtons(className, handler) {
    var buttons = document.getElementsByClassName(className);

    for (var i = 0; i < buttons.length; i++) {
        buttons[i].addEventListener("click", handler);
    }
}


// This function sends a request to the backend and gives back the answer
async function sendRequest(method, path, bodyObject) {
    var options = {
        method: method,
        credentials: "include",
        headers: {}
    };

    // If we have something to send, send it as JSON
    if (bodyObject != null) {
        options.headers["Content-Type"] = "application/json";
        options.body = JSON.stringify(bodyObject);
    }

    try {
        var response = await fetch(backendAddress + path, options);
        var data = await response.json();
        return { ok: response.ok, data: data };
    } catch (error) {
        console.log(error);
        return { ok: false, data: { message: "Cannot reach the server. Is python app.py running?" } };
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


// This function checks that an admin is logged in
async function checkAdminLogin() {
    var result = await sendRequest("GET", "/api/me", null);

    // If nobody is logged in, go to the login page
    if (result.data.logged_in == false) {
        window.location.href = "login.html";
        return false;
    }

    // Members are not allowed here
    if (result.data.role != "admin") {
        window.location.href = "home.html";
        return false;
    }

    return true;
}


// This function loads the numbers for the overview
async function loadStats() {
    var result = await sendRequest("GET", "/api/admin/stats", null);

    if (result.ok == false) {
        return;
    }

    var stats = result.data;
    document.getElementById("memberCount").textContent = stats.member_count;
    document.getElementById("activeMembershipCount").textContent = stats.active_membership_count;
    document.getElementById("revenueTotal").textContent = stats.revenue + " " + currencyName;
    document.getElementById("refundTotal").textContent = stats.refund_total + " " + currencyName;
    document.getElementById("upcomingSessionCount").textContent = stats.upcoming_session_count;
    document.getElementById("coachCount").textContent = stats.coach_count;
    document.getElementById("planCount").textContent = stats.plan_count;
    document.getElementById("unreadMessageCount").textContent = stats.unread_message_count;
}


// ----------------------------------------------------------------------
// Members, coaches, plans and offers (they all work the same way)
// ----------------------------------------------------------------------

// This function builds the table of one thing (members, coaches, plans or offers)
function renderResourceTable(name) {
    var config = resources[name];
    var rows = resourceRows[name];
    var tableBody = document.getElementById(name + "TableBody");

    // If there are no rows, say so
    if (rows.length == 0) {
        tableBody.innerHTML = makeEmptyRow(config.columns.length + 1, "Nothing here yet.");
        return;
    }

    var allRowsHtml = "";
    for (var i = 0; i < rows.length; i++) {
        var id = rows[i][config.idField];

        allRowsHtml = allRowsHtml + "<tr>" + makeCells(rows[i], config.columns);
        allRowsHtml = allRowsHtml + "<td><div class='table-actions'>";
        allRowsHtml = allRowsHtml + "<button class='btn btn-small edit-" + name + "-button' data-resource='" + name + "' data-id='" + id + "'>Edit</button>";
        allRowsHtml = allRowsHtml + "<button class='btn btn-danger btn-small delete-" + name + "-button' data-resource='" + name + "' data-id='" + id + "'>Delete</button>";
        allRowsHtml = allRowsHtml + "</div></td></tr>";
    }

    tableBody.innerHTML = allRowsHtml;
    connectButtons("edit-" + name + "-button", startEdit);
    connectButtons("delete-" + name + "-button", deleteRecord);
}


// This function loads the rows of one thing from the backend
async function loadResource(name) {
    var result = await sendRequest("GET", resources[name].url, null);

    if (result.ok == false) {
        showMessage(name, result.data.message, true);
        return;
    }

    resourceRows[name] = result.data;
    renderResourceTable(name);

    // When the coaches change, the coach list of the session form changes too
    if (name == "coaches") {
        fillCoachSelect();
    }
}


// This function empties the form and puts it back in "add" mode
function resetForm(name) {
    var config = resources[name];

    for (var i = 0; i < config.fields.length; i++) {
        var box = document.getElementById(name + "_" + config.fields[i]);

        if (checkboxFields.indexOf(config.fields[i]) >= 0) {
            box.checked = false;
        } else {
            box.value = "";
        }
    }

    editingIds[name] = null;
    document.getElementById(name + "_formTitle").textContent = config.addTitle;
    document.getElementById(name + "_saveButton").textContent = config.addLabel;
    document.getElementById(name + "_cancelEditButton").classList.add("hidden");
}


// This function runs when the admin clicks "Edit" on a row
function startEdit(event) {
    var name = event.currentTarget.getAttribute("data-resource");
    var id = event.currentTarget.getAttribute("data-id");
    var config = resources[name];
    var rows = resourceRows[name];

    // Find the row that was clicked
    var row = null;
    for (var i = 0; i < rows.length; i++) {
        if (String(rows[i][config.idField]) == id) {
            row = rows[i];
        }
    }

    if (row == null) {
        return;
    }

    // Put the values of the row in the form
    for (var j = 0; j < config.fields.length; j++) {
        var field = config.fields[j];
        var box = document.getElementById(name + "_" + field);
        var value = row[field];

        if (checkboxFields.indexOf(field) >= 0) {
            box.checked = (value == 1);
        } else if (value === null || value === undefined) {
            box.value = "";
        } else {
            box.value = value;
        }
    }

    // Switch the form to "edit" mode
    editingIds[name] = id;
    document.getElementById(name + "_formTitle").textContent = config.editTitle;
    document.getElementById(name + "_saveButton").textContent = config.editLabel;
    document.getElementById(name + "_cancelEditButton").classList.remove("hidden");
    showMessage(name, "", false);
    document.getElementById(name + "_formTitle").scrollIntoView();
}


// This function saves the form (a new row, or the changes of an old row)
async function saveRecord(name) {
    var config = resources[name];
    var bodyObject = {};

    // Read every box of the form
    for (var i = 0; i < config.fields.length; i++) {
        var field = config.fields[i];
        var box = document.getElementById(name + "_" + field);

        if (checkboxFields.indexOf(field) >= 0) {
            bodyObject[field] = box.checked;
        } else {
            bodyObject[field] = box.value;
        }
    }

    // Decide if we are adding a new row or changing an old one
    var result;
    if (editingIds[name] == null) {
        result = await sendRequest("POST", config.url, bodyObject);
    } else {
        result = await sendRequest("PUT", config.url + "/" + editingIds[name], bodyObject);
    }

    if (result.ok) {
        showMessage(name, result.data.message, false);
        resetForm(name);
        await loadResource(name);
        loadStats();

        // A new or changed member can change the memberships and payments lists
        if (name == "members") {
            loadMemberships();
        }
    } else {
        showMessage(name, result.data.message, true);
    }
}


// This function runs when the admin clicks "Delete" on a row
async function deleteRecord(event) {
    var name = event.currentTarget.getAttribute("data-resource");
    var id = event.currentTarget.getAttribute("data-id");

    var sure = confirm(resources[name].deleteWarning);
    if (sure == false) {
        return;
    }

    var result = await sendRequest("DELETE", resources[name].url + "/" + id, null);

    if (result.ok) {
        showMessage(name, result.data.message, false);
        resetForm(name);
        await loadResource(name);
        loadStats();
        loadSlots();
        loadMemberships();
        loadPayments();
    } else {
        showMessage(name, result.data.message, true);
    }
}


// This function connects the Save and Cancel Edit buttons of one form
function connectFormButtons(name) {
    document.getElementById(name + "_saveButton").addEventListener("click", function () {
        saveRecord(name);
    });

    document.getElementById(name + "_cancelEditButton").addEventListener("click", function () {
        resetForm(name);
        showMessage(name, "", false);
    });
}


// ----------------------------------------------------------------------
// Session times and who booked them
// ----------------------------------------------------------------------

// This function fills the coach list of the session form
function fillCoachSelect() {
    var select = document.getElementById("slots_coach_id");
    var coaches = resourceRows.coaches;
    var optionsHtml = "";

    for (var i = 0; i < coaches.length; i++) {
        optionsHtml = optionsHtml + "<option value='" + coaches[i].coach_id + "'>" + escapeHtml(coaches[i].coach_name) + "</option>";
    }

    select.innerHTML = optionsHtml;
}


// This function builds the table of session times
function renderSlotsTable() {
    var tableBody = document.getElementById("slotsTableBody");
    var columns = ["coach_name", "slot_date", "slot_time", "booking_text", "when_text"];

    if (slotRows.length == 0) {
        tableBody.innerHTML = makeEmptyRow(columns.length + 1, "No session times yet.");
        return;
    }

    var allRowsHtml = "";
    for (var i = 0; i < slotRows.length; i++) {
        var slot = slotRows[i];

        allRowsHtml = allRowsHtml + "<tr>" + makeCells(slot, columns);
        allRowsHtml = allRowsHtml + "<td><div class='table-actions'>";

        // A booked session in the future can be cancelled
        if (slot.is_booked && slot.when_text == "Upcoming") {
            allRowsHtml = allRowsHtml + "<button class='btn btn-warning btn-small free-slot-button' data-id='" + slot.slot_id + "' data-message='slots'>Cancel Booking</button>";
        }

        allRowsHtml = allRowsHtml + "<button class='btn btn-danger btn-small delete-slot-button' data-id='" + slot.slot_id + "'>Delete</button>";
        allRowsHtml = allRowsHtml + "</div></td></tr>";
    }

    tableBody.innerHTML = allRowsHtml;
    connectButtons("free-slot-button", freeSlot);
    connectButtons("delete-slot-button", deleteSlot);
}


// This function builds the "Who Booked" table
function renderBookingsTable() {
    var tableBody = document.getElementById("bookingsTableBody");
    var columns = ["full_name", "email", "coach_name", "slot_date", "slot_time", "when_text", "profile_text", "notes_text"];
    var allRowsHtml = "";

    for (var i = 0; i < slotRows.length; i++) {
        var slot = slotRows[i];

        // We only show the sessions that somebody booked
        if (slot.is_booked) {
            allRowsHtml = allRowsHtml + "<tr>" + makeCells(slot, columns);
            allRowsHtml = allRowsHtml + "<td>";

            if (slot.when_text == "Upcoming") {
                allRowsHtml = allRowsHtml + "<button class='btn btn-warning btn-small free-booking-button' data-id='" + slot.slot_id + "' data-message='bookings'>Cancel Booking</button>";
            }

            allRowsHtml = allRowsHtml + "</td></tr>";
        }
    }

    if (allRowsHtml == "") {
        allRowsHtml = makeEmptyRow(columns.length + 1, "Nobody booked a session yet.");
    }

    tableBody.innerHTML = allRowsHtml;
    connectButtons("free-booking-button", freeSlot);
}


// This function shows the next 5 booked sessions on the overview
function renderOverviewBookings() {
    var tableBody = document.getElementById("overviewBookingsBody");
    var columns = ["full_name", "coach_name", "slot_date", "slot_time"];
    var allRowsHtml = "";
    var shown = 0;

    for (var i = 0; i < slotRows.length; i++) {
        var slot = slotRows[i];

        if (slot.is_booked && slot.when_text == "Upcoming" && shown < 5) {
            allRowsHtml = allRowsHtml + "<tr>" + makeCells(slot, columns) + "</tr>";
            shown = shown + 1;
        }
    }

    if (allRowsHtml == "") {
        allRowsHtml = makeEmptyRow(columns.length, "No upcoming bookings.");
    }

    tableBody.innerHTML = allRowsHtml;
}


// This function loads all session times from the backend
async function loadSlots() {
    var result = await sendRequest("GET", "/api/admin/slots", null);

    if (result.ok == false) {
        showMessage("slots", result.data.message, true);
        return;
    }

    slotRows = result.data;
    renderSlotsTable();
    renderBookingsTable();
    renderOverviewBookings();
}


// This function adds a new session time
async function addSlot() {
    var bodyObject = {
        coach_id: document.getElementById("slots_coach_id").value,
        slot_date: document.getElementById("slots_slot_date").value,
        slot_time: document.getElementById("slots_slot_time").value
    };

    var result = await sendRequest("POST", "/api/admin/slots", bodyObject);

    if (result.ok) {
        showMessage("slots", result.data.message, false);
        document.getElementById("slots_slot_date").value = "";
        document.getElementById("slots_slot_time").value = "";
        loadSlots();
    } else {
        showMessage("slots", result.data.message, true);
    }
}


// This function cancels a booking so the time is free again
async function freeSlot(event) {
    var slotId = event.currentTarget.getAttribute("data-id");
    var messageName = event.currentTarget.getAttribute("data-message");

    var sure = confirm("Cancel this booking? The time will be free again.");
    if (sure == false) {
        return;
    }

    var result = await sendRequest("POST", "/api/admin/slots/" + slotId + "/clear", null);

    if (result.ok) {
        showMessage(messageName, result.data.message, false);
        loadSlots();
        loadStats();
    } else {
        showMessage(messageName, result.data.message, true);
    }
}


// This function deletes a session time
async function deleteSlot(event) {
    var slotId = event.currentTarget.getAttribute("data-id");

    var sure = confirm("Delete this session time? If somebody booked it, the booking is removed too.");
    if (sure == false) {
        return;
    }

    var result = await sendRequest("DELETE", "/api/admin/slots/" + slotId, null);

    if (result.ok) {
        showMessage("slots", result.data.message, false);
        loadSlots();
        loadStats();
    } else {
        showMessage("slots", result.data.message, true);
    }
}


// ----------------------------------------------------------------------
// Memberships and payments
// ----------------------------------------------------------------------

// This function builds the table of memberships
function renderMembershipsTable() {
    var tableBody = document.getElementById("membershipsTableBody");
    var columns = ["full_name", "plan_name", "coach_name", "start_date", "end_date", "current_status", "paid_amount", "refund_amount"];

    if (membershipRows.length == 0) {
        tableBody.innerHTML = makeEmptyRow(columns.length + 1, "No memberships yet.");
        return;
    }

    var allRowsHtml = "";
    for (var i = 0; i < membershipRows.length; i++) {
        var membership = membershipRows[i];

        allRowsHtml = allRowsHtml + "<tr>" + makeCells(membership, columns) + "<td>";

        // Only an active membership can be cancelled
        if (membership.current_status == "active") {
            allRowsHtml = allRowsHtml + "<button class='btn btn-warning btn-small admin-cancel-membership-button' data-id='" + membership.membership_id + "' data-refund='" + membership.refund_estimate + "'>Cancel and Refund</button>";
        }

        allRowsHtml = allRowsHtml + "</td></tr>";
    }

    tableBody.innerHTML = allRowsHtml;
    connectButtons("admin-cancel-membership-button", cancelMembership);
}


// This function loads all memberships from the backend
async function loadMemberships() {
    var result = await sendRequest("GET", "/api/admin/memberships", null);

    if (result.ok == false) {
        showMessage("memberships", result.data.message, true);
        return;
    }

    membershipRows = result.data;
    renderMembershipsTable();
}


// This function cancels a membership and refunds the member
async function cancelMembership(event) {
    var membershipId = event.currentTarget.getAttribute("data-id");
    var refund = event.currentTarget.getAttribute("data-refund");

    var sure = confirm("Cancel this membership and refund " + refund + " " + currencyName + " to the member? Their upcoming sessions will be cancelled.");
    if (sure == false) {
        return;
    }

    var result = await sendRequest("POST", "/api/admin/memberships/" + membershipId + "/cancel", null);

    if (result.ok) {
        showMessage("memberships", result.data.message, false);
    } else {
        showMessage("memberships", result.data.message, true);
    }

    // Load everything that can change after a cancellation
    loadMemberships();
    loadPayments();
    loadSlots();
    loadResource("members");
    loadStats();
}


// This function loads and shows all payments
async function loadPayments() {
    var tableBody = document.getElementById("paymentsTableBody");
    var columns = ["payment_id", "full_name", "plan_name", "amount", "payment_method", "payment_status", "refund_amount", "payment_date"];

    var result = await sendRequest("GET", "/api/admin/payments", null);

    if (result.ok == false) {
        tableBody.innerHTML = makeEmptyRow(columns.length, result.data.message);
        return;
    }

    if (result.data.length == 0) {
        tableBody.innerHTML = makeEmptyRow(columns.length, "No payments yet.");
        return;
    }

    var allRowsHtml = "";
    for (var i = 0; i < result.data.length; i++) {
        allRowsHtml = allRowsHtml + "<tr>" + makeCells(result.data[i], columns) + "</tr>";
    }

    tableBody.innerHTML = allRowsHtml;
}


// ----------------------------------------------------------------------
// Contact messages and coach reviews
// ----------------------------------------------------------------------

var messageRows = [];
var reviewRows = [];


// This function builds the list of contact messages
function renderMessages() {
    var messagesList = document.getElementById("messagesList");

    if (messageRows.length == 0) {
        messagesList.innerHTML = "<div class='empty-state'><p>No messages yet.</p></div>";
        return;
    }

    var allRowsHtml = "";
    for (var i = 0; i < messageRows.length; i++) {
        var message = messageRows[i];

        var subjectText = "No subject";
        if (message.subject != null) {
            subjectText = message.subject;
        }

        allRowsHtml = allRowsHtml + "<div class='booking-row'>";
        allRowsHtml = allRowsHtml + "<div class='booking-info'>";
        allRowsHtml = allRowsHtml + "<h3>" + escapeHtml(message.full_name) + " (" + escapeHtml(message.email) + ")</h3>";
        allRowsHtml = allRowsHtml + "<p><strong>" + escapeHtml(subjectText) + "</strong> - " + message.created_at + "</p>";
        allRowsHtml = allRowsHtml + "<p class='message-body'>" + escapeHtml(message.message_text) + "</p>";
        allRowsHtml = allRowsHtml + "</div>";
        allRowsHtml = allRowsHtml + "<div class='booking-actions'>";

        if (message.is_read) {
            allRowsHtml = allRowsHtml + "<span class='badge-gray'>Read</span>";
        } else {
            allRowsHtml = allRowsHtml + "<span class='badge-green'>New</span>";
            allRowsHtml = allRowsHtml + "<button class='btn btn-small read-message-button' data-id='" + message.message_id + "'>Mark as Read</button>";
        }

        allRowsHtml = allRowsHtml + "<button class='btn btn-danger btn-small delete-message-button' data-id='" + message.message_id + "'>Delete</button>";
        allRowsHtml = allRowsHtml + "</div></div>";
    }

    messagesList.innerHTML = allRowsHtml;
    connectButtons("read-message-button", markMessageRead);
    connectButtons("delete-message-button", deleteMessage);
}


// This function loads the contact messages from the backend
async function loadMessages() {
    var result = await sendRequest("GET", "/api/admin/messages", null);

    if (result.ok == false) {
        showMessage("messages", result.data.message, true);
        return;
    }

    messageRows = result.data;
    renderMessages();
}


// This function marks a message as read
async function markMessageRead(event) {
    var messageId = event.currentTarget.getAttribute("data-id");

    var result = await sendRequest("POST", "/api/admin/messages/" + messageId + "/read", null);

    if (result.ok) {
        await loadMessages();
        loadStats();
    } else {
        showMessage("messages", result.data.message, true);
    }
}


// This function deletes a message
async function deleteMessage(event) {
    var messageId = event.currentTarget.getAttribute("data-id");

    var sure = confirm("Delete this message?");
    if (sure == false) {
        return;
    }

    var result = await sendRequest("DELETE", "/api/admin/messages/" + messageId, null);

    if (result.ok) {
        await loadMessages();
        loadStats();
    } else {
        showMessage("messages", result.data.message, true);
    }
}


// This function builds the table of reviews
function renderReviewsTable() {
    var tableBody = document.getElementById("reviewsTableBody");
    var columns = ["coach_name", "full_name", "rating", "review_short", "created_at"];

    if (reviewRows.length == 0) {
        tableBody.innerHTML = makeEmptyRow(columns.length + 1, "No reviews yet.");
        return;
    }

    var allRowsHtml = "";
    for (var i = 0; i < reviewRows.length; i++) {
        var review = reviewRows[i];

        allRowsHtml = allRowsHtml + "<tr>" + makeCells(review, columns) + "<td>";
        allRowsHtml = allRowsHtml + "<button class='btn btn-danger btn-small delete-review-button' data-id='" + review.review_id + "'>Delete</button>";
        allRowsHtml = allRowsHtml + "</td></tr>";
    }

    tableBody.innerHTML = allRowsHtml;
    connectButtons("delete-review-button", deleteReview);
}


// This function loads all coach reviews from the backend
async function loadReviews() {
    var result = await sendRequest("GET", "/api/admin/reviews", null);

    if (result.ok == false) {
        showMessage("reviews", result.data.message, true);
        return;
    }

    reviewRows = result.data;
    renderReviewsTable();
}


// This function deletes a review
async function deleteReview(event) {
    var reviewId = event.currentTarget.getAttribute("data-id");

    var sure = confirm("Delete this review?");
    if (sure == false) {
        return;
    }

    var result = await sendRequest("DELETE", "/api/admin/reviews/" + reviewId, null);

    if (result.ok) {
        showMessage("reviews", result.data.message, false);
        loadReviews();
        loadResource("coaches");
    } else {
        showMessage("reviews", result.data.message, true);
    }
}


// ----------------------------------------------------------------------
// Start the page
// ----------------------------------------------------------------------

// This function starts the page
async function startAdminPage() {
    var isAdminLoggedIn = await checkAdminLogin();

    // If this is not an admin, checkAdminLogin already sent them away
    if (isAdminLoggedIn == false) {
        return;
    }

    connectSideLinks();

    // Connect the forms of members, coaches, plans and offers
    var names = ["members", "coaches", "plans", "offers"];
    for (var i = 0; i < names.length; i++) {
        editingIds[names[i]] = null;
        connectFormButtons(names[i]);
        loadResource(names[i]);
    }

    document.getElementById("slots_addButton").addEventListener("click", addSlot);

    loadStats();
    loadSlots();
    loadMemberships();
    loadPayments();
    loadReviews();
    loadMessages();
}


// Connect the Log Out buttons
adminLogoutButton.addEventListener("click", logoutUser);
sideLogoutButton.addEventListener("click", logoutUser);

// Run it when the page opens
startAdminPage();
