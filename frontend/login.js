// Find the things we need on the page
var emailInput = document.getElementById("emailInput");
var passwordInput = document.getElementById("passwordInput");
var loginButton = document.getElementById("loginButton");
var messageText = document.getElementById("messageText");


// This function shows a message under the button
function showMessage(text, isError) {
    messageText.textContent = text;

    if (isError) {
        messageText.className = "message message-error";
    } else {
        messageText.className = "message message-success";
    }
}


// This function sends us to the right page after login
function goToNextPage(role) {
    if (role == "admin") {
        // The admin has his own separate panel
        window.location.href = "admin.html";
    } else {
        // Members go to the home page, where the top bar says "Hi, name"
        window.location.href = "home.html";
    }
}


// This function sends the email and password to the backend
async function loginUser() {
    // Read what the person typed
    var email = emailInput.value;
    var password = passwordInput.value;

    // Stop if something is empty
    if (email == "" || password == "") {
        showMessage("Please type your email and password.", true);
        return;
    }

    try {
        // Send the email and password to the backend
        var response = await fetch(backendAddress + "/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            credentials: "include",
            body: JSON.stringify({ email: email, password: password })
        });

        // Read the answer from the backend
        var result = await response.json();

        // Show the answer and move on if it worked
        if (response.ok) {
            showMessage(result.message, false);
            goToNextPage(result.role);
        } else {
            showMessage(result.message, true);
        }
    } catch (error) {
        showMessage("Cannot reach the server. Is python app.py running?", true);
    }
}


// Run the login function when the button is clicked
loginButton.addEventListener("click", loginUser);
