// Find the things we need on the page
var nameInput = document.getElementById("nameInput");
var emailInput = document.getElementById("emailInput");
var passwordInput = document.getElementById("passwordInput");
var confirmInput = document.getElementById("confirmInput");
var registerButton = document.getElementById("registerButton");
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


// This function sends the new account to the backend
async function registerUser() {
    // Read what the person typed
    var fullName = nameInput.value;
    var email = emailInput.value;
    var password = passwordInput.value;
    var confirmPassword = confirmInput.value;

    // Stop if something is empty
    if (fullName == "" || email == "" || password == "") {
        showMessage("Please fill in all the fields.", true);
        return;
    }

    // Stop if the two passwords are different
    if (password != confirmPassword) {
        showMessage("The two passwords do not match.", true);
        return;
    }

    try {
        // Send the new account to the backend
        var response = await fetch(backendAddress + "/api/register", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                full_name: fullName,
                email: email,
                password: password
            })
        });

        // Read the answer from the backend
        var result = await response.json();

        if (response.ok) {
            showMessage(result.message, false);
            // Wait 1.5 seconds, then go to the login page
            setTimeout(function () {
                window.location.href = "login.html";
            }, 1500);
        } else {
            showMessage(result.message, true);
        }
    } catch (error) {
        showMessage("Cannot reach the server. Is python app.py running?", true);
    }
}


// Run the register function when the button is clicked
registerButton.addEventListener("click", registerUser);
