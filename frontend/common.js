// The address of our backend
var backendAddress = "http://127.0.0.1:5000";


// This function makes text safe to show on the page (so nobody can sneak code in)
function escapeHtml(text) {
    var helper = document.createElement("div");
    helper.textContent = text;
    return helper.innerHTML;
}


// This function makes the stars of a rating, for example 4 gives 4 full stars and 1 empty star
function makeStars(rating) {
    var stars = "";
    var rounded = Math.round(Number(rating));

    for (var i = 1; i <= 5; i++) {
        if (i <= rounded) {
            stars = stars + "\u2605";
        } else {
            stars = stars + "\u2606";
        }
    }

    return stars;
}


// This function writes the rating of a coach, for example "4.5 (12 reviews)"
function makeRatingText(averageRating, reviewCount) {
    if (reviewCount == 0 || averageRating == null) {
        return "No reviews yet";
    }

    var reviewWord = "reviews";
    if (reviewCount == 1) {
        reviewWord = "review";
    }

    return makeStars(averageRating) + " " + averageRating + " (" + reviewCount + " " + reviewWord + ")";
}


// This function works out the BMI of a person, for example "BMI 23.4 (Normal)"
function makeBmiText(weightKg, heightCm) {
    var weight = Number(weightKg);
    var height = Number(heightCm);

    // If one of the two is missing, we cannot work it out
    if (!weight || !height) {
        return "";
    }

    var heightInMeters = height / 100;
    var bmi = Math.round(weight / (heightInMeters * heightInMeters) * 10) / 10;

    var category = "Normal";
    if (bmi < 18.5) {
        category = "Underweight";
    } else if (bmi >= 30) {
        category = "Obese";
    } else if (bmi >= 25) {
        category = "Overweight";
    }

    return "BMI " + bmi + " (" + category + ")";
}


// This function opens and closes the menu on small screens
function setupMenuButton() {
    var menuToggle = document.getElementById("menuToggle");
    var mainNav = document.getElementById("mainNav");

    // If this page has no menu button, stop here
    if (menuToggle == null) {
        return;
    }

    // Open or close the menu when the button is clicked
    menuToggle.addEventListener("click", function () {
        mainNav.classList.toggle("nav-open");
    });
}


// This function logs the person out and goes to the home page
async function logoutUser() {
    await fetch(backendAddress + "/api/logout", {
        method: "POST",
        credentials: "include"
    });

    window.location.href = "home.html";
}


// This function gives the admin a different menu than the members
function changeMenuForAdmin(userMenu) {
    var links = userMenu.getElementsByTagName("a");

    for (var i = 0; i < links.length; i++) {
        var address = links[i].getAttribute("href");

        // The dashboard link becomes the admin panel link
        if (address == "dashboard.html") {
            links[i].setAttribute("href", "admin.html");
            links[i].textContent = "Admin Panel";
        }

        // Admins do not have bookings or a member profile
        if (address == "dashboard.html#bookings" || address == "dashboard.html#profile") {
            links[i].classList.add("hidden");
        }
    }
}


// This function changes the top bar when someone is logged in
async function updateTopBar() {
    var guestButtons = document.getElementById("guestButtons");
    var userMenu = document.getElementById("userMenu");
    var userMenuButton = document.getElementById("userMenuButton");
    var logoutLink = document.getElementById("logoutLink");

    // If this page has no member menu (like the admin page), stop here
    if (userMenu == null) {
        return;
    }

    try {
        // Ask the backend who is logged in
        var response = await fetch(backendAddress + "/api/me", {
            credentials: "include"
        });
        var result = await response.json();

        // If someone is logged in, show their name and their menu
        if (result.logged_in == true) {
            var firstName = result.full_name.split(" ")[0];
            userMenuButton.textContent = "Hi, " + firstName + " \u25BC";
            guestButtons.classList.add("hidden");
            userMenu.classList.remove("hidden");

            // Admins get a different menu
            if (result.role == "admin") {
                changeMenuForAdmin(userMenu);
            }
        }
    } catch (error) {
        console.log(error);
    }

    // Make the Log Out link in the menu work
    if (logoutLink != null) {
        logoutLink.addEventListener("click", function (event) {
            event.preventDefault();
            logoutUser();
        });
    }
}


// This function shows the "first order" promo code to people who can use it
async function showFirstOrderBanner() {
    var banner = document.getElementById("firstOrderBanner");

    // If this page has no banner, stop here
    if (banner == null) {
        return;
    }

    try {
        // Ask the backend if there is a first-order offer for this person
        var response = await fetch(backendAddress + "/api/first-order-offer", {
            credentials: "include"
        });
        var result = await response.json();

        if (result.has_offer == false) {
            return;
        }

        // Write the offer in the banner and show it
        document.getElementById("firstOrderTitle").textContent = "Welcome gift: " + result.discount_percent + "% off your first order";
        document.getElementById("firstOrderText").textContent = "Use code " + result.promo_code + " at checkout.";
        banner.setAttribute("data-code", result.promo_code);
        banner.classList.remove("hidden");
    } catch (error) {
        console.log(error);
    }
}


// Run these when the page opens
setupMenuButton();
updateTopBar();
showFirstOrderBanner();
