// Find the things we need on the page
var contactName = document.getElementById("contactName");
var contactEmail = document.getElementById("contactEmail");
var contactSubject = document.getElementById("contactSubject");
var contactMessage = document.getElementById("contactMessage");
var sendMessageButton = document.getElementById("sendMessageButton");
var contactMessageText = document.getElementById("contactMessageText");


// This function shows a message under the button
function showMessage(text, isError) {
    contactMessageText.textContent = text;

    if (isError) {
        contactMessageText.className = "message message-error";
    } else {
        contactMessageText.className = "message message-success";
    }
}


// This function sends the message to the backend
async function sendMessage() {
    var name = contactName.value.trim();
    var email = contactEmail.value.trim();
    var subject = contactSubject.value.trim();
    var message = contactMessage.value.trim();

    // Stop if something important is empty
    if (name == "" || email == "" || message == "") {
        showMessage("Please fill in your name, email and message.", true);
        return;
    }

    try {
        // Send the message to the backend
        var response = await fetch(backendAddress + "/api/contact", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                full_name: name,
                email: email,
                subject: subject,
                message: message
            })
        });
        var result = await response.json();

        if (response.ok) {
            showMessage(result.message, false);

            // Empty the form
            contactName.value = "";
            contactEmail.value = "";
            contactSubject.value = "";
            contactMessage.value = "";
        } else {
            showMessage(result.message, true);
        }
    } catch (error) {
        console.log(error);
        showMessage("Cannot reach the server. Is python app.py running?", true);
    }
}


// Run the send function when the button is clicked
sendMessageButton.addEventListener("click", sendMessage);
