// Find the things we need on the page
var emailStep = document.getElementById("emailStep");
var resetStep = document.getElementById("resetStep");
var emailInput = document.getElementById("emailInput");
var getCodeButton = document.getElementById("getCodeButton");
var codeBox = document.getElementById("codeBox");
var codeInput = document.getElementById("codeInput");
var newPasswordInput = document.getElementById("newPasswordInput");
var confirmPasswordInput = document.getElementById("confirmPasswordInput");
var resetButton = document.getElementById("resetButton");
var messageText = document.getElementById("messageText");


// This function shows a message under the buttons
function showMessage(text, isError) {
    messageText.textContent = text;

    if (isError) {
        messageText.className = "message message-error";
    } else {
        messageText.className = "message message-success";
    }
}


// This function asks the backend for a reset code
async function getResetCode() {
    var email = emailInput.value;

    // Stop if the email is empty
    if (email == "") {
        showMessage("Please type your email first.", true);
        return;
    }

    try {
        // Ask the backend for a code
        var response = await fetch(backendAddress + "/api/forgot-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ email: email })
        });
        var result = await response.json();

        if (response.ok) {
            // Show the second step with the code
            emailStep.classList.add("hidden");
            resetStep.classList.remove("hidden");
            codeBox.textContent = "Demo mode: your reset code is " + result.reset_code + ". It works for 15 minutes.";
            showMessage("", false);
        } else {
            showMessage(result.message, true);
        }
    } catch (error) {
        console.log(error);
        showMessage("Cannot reach the server. Is python app.py running?", true);
    }
}


// This function sends the code and the new password to the backend
async function resetPassword() {
    var email = emailInput.value;
    var resetCode = codeInput.value.trim();
    var newPassword = newPasswordInput.value;
    var confirmPassword = confirmPasswordInput.value;

    // Stop if something is empty
    if (resetCode == "" || newPassword == "") {
        showMessage("Please type the code and the new password.", true);
        return;
    }

    // Stop if the two passwords are different
    if (newPassword != confirmPassword) {
        showMessage("The two passwords do not match.", true);
        return;
    }

    try {
        // Send everything to the backend
        var response = await fetch(backendAddress + "/api/reset-password", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                email: email,
                reset_code: resetCode,
                new_password: newPassword
            })
        });
        var result = await response.json();

        if (response.ok) {
            showMessage(result.message + " Taking you to the login page...", false);

            // Wait 2 seconds, then go to the login page
            setTimeout(function () {
                window.location.href = "login.html";
            }, 2000);
        } else {
            showMessage(result.message, true);
        }
    } catch (error) {
        console.log(error);
        showMessage("Cannot reach the server. Is python app.py running?", true);
    }
}


// Connect the buttons
getCodeButton.addEventListener("click", getResetCode);
resetButton.addEventListener("click", resetPassword);
