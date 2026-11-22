import calendar
import secrets
from datetime import date, datetime, timedelta
from decimal import Decimal

from flask import Flask, jsonify, request, session
from flask_cors import CORS
import bcrypt
from database import connect_to_database

app = Flask(__name__)

# This secret word protects the login cookie. Change it to any long word you like.
app.secret_key = "change-this-to-any-long-secret-word"

# Allow our web pages (Live Server) to talk to this backend
CORS(app, supports_credentials=True, origins=["http://127.0.0.1:5500"])


# ----------------------------------------------------------------------
# Small helper functions
# ----------------------------------------------------------------------

# This turns a MySQL time into text like 10:00
def make_time_text(slot_time):
    if hasattr(slot_time, "total_seconds"):
        total_seconds = int(slot_time.total_seconds())
        hours = total_seconds // 3600
        minutes = (total_seconds % 3600) // 60
        return str(hours).zfill(2) + ":" + str(minutes).zfill(2)

    return slot_time.strftime("%H:%M")


# This adds months to a date (for example 1 January + 3 months = 1 April)
def add_months(start_date, months):
    month_number = start_date.month - 1 + months
    new_year = start_date.year + month_number // 12
    new_month = month_number % 12 + 1
    last_day = calendar.monthrange(new_year, new_month)[1]
    new_day = min(start_date.day, last_day)
    return date(new_year, new_month, new_day)


# This finds an offer by its promo code (returns None if it is not valid)
def find_offer_by_code(promo_code):
    connection = connect_to_database()
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        "SELECT offer_id, title, discount_percent, first_order_only FROM offers "
        "WHERE promo_code = %s AND (end_date IS NULL OR end_date >= CURDATE())",
        (promo_code,)
    )
    offer = cursor.fetchone()
    cursor.close()
    connection.close()
    return offer


# This reads rows from the database and gives them back as a list
def read_rows(sql, params=()):
    connection = connect_to_database()
    cursor = connection.cursor(dictionary=True)
    try:
        cursor.execute(sql, params)
        return cursor.fetchall()
    finally:
        cursor.close()
        connection.close()


# This runs an INSERT, UPDATE or DELETE and gives back (rows changed, new id)
def change_database(sql, params=()):
    connection = connect_to_database()
    cursor = connection.cursor()
    try:
        cursor.execute(sql, params)
        connection.commit()
        return cursor.rowcount, cursor.lastrowid
    finally:
        cursor.close()
        connection.close()


# This checks if a member already made an order before (any membership counts)
def member_has_ordered_before(user_id):
    rows = read_rows("SELECT COUNT(*) AS total FROM memberships WHERE user_id = %s", (user_id,))
    return rows[0]["total"] > 0


# This works out the refund: the unused days of the membership are paid back
def calculate_refund(paid_amount, start_date, end_date):
    if paid_amount is None:
        return Decimal("0.00")

    total_days = max((end_date - start_date).days, 1)
    days_left = max((end_date - date.today()).days, 0)
    days_left = min(days_left, total_days)
    return (paid_amount * days_left / total_days).quantize(Decimal("0.01"))


# This cancels a membership, refunds the unused days and frees the upcoming sessions
# It gives back (refund amount, None) or (None, error message)
def cancel_membership_with_refund(membership_id, owner_id=None):
    connection = connect_to_database()
    cursor = connection.cursor(dictionary=True)

    try:
        cursor.execute(
            "SELECT m.membership_id, m.user_id, m.start_date, m.end_date, m.status, "
            "pay.payment_id, pay.amount "
            "FROM memberships m "
            "LEFT JOIN payments pay ON pay.membership_id = m.membership_id AND pay.payment_status = 'paid' "
            "WHERE m.membership_id = %s",
            (membership_id,)
        )
        membership = cursor.fetchone()

        # Members can only cancel their own memberships
        if membership is None or (owner_id is not None and membership["user_id"] != owner_id):
            return None, "This membership was not found."

        if membership["status"] != "active" or membership["end_date"] < date.today():
            return None, "This membership is not active, so it cannot be cancelled."

        refund = calculate_refund(membership["amount"], membership["start_date"], membership["end_date"])

        # Mark the membership as cancelled
        cursor.execute(
            "UPDATE memberships SET status = 'cancelled' WHERE membership_id = %s",
            (membership_id,)
        )

        # Mark the payment as refunded
        if membership["payment_id"] is not None:
            cursor.execute(
                "UPDATE payments SET payment_status = 'refunded', refund_amount = %s, "
                "refunded_at = NOW() WHERE payment_id = %s",
                (refund, membership["payment_id"])
            )

        # Free the upcoming sessions this member booked
        cursor.execute(
            "UPDATE coach_slots SET booked_by = NULL WHERE booked_by = %s AND slot_date >= CURDATE()",
            (membership["user_id"],)
        )

        connection.commit()
        return refund, None
    except Exception as error:
        connection.rollback()
        print(error)
        return None, "Something went wrong. Please try again."
    finally:
        cursor.close()
        connection.close()


# This gives back an error answer if the person is not an admin (otherwise None)
def admin_only():
    if session.get("role") != "admin":
        return jsonify({"message": "Admins only."}), 403

    return None


# This turns numbers and dates of a row into text so the page can read them
def clean_row(row):
    for key in row:
        value = row[key]

        if isinstance(value, Decimal):
            row[key] = str(value)
        elif isinstance(value, (date, datetime)):
            row[key] = value.isoformat()
        elif isinstance(value, timedelta):
            row[key] = make_time_text(value)

    return row


# This gives the BMI of a person as text, like "BMI 23.4 (Normal)"
def make_bmi_text(weight_kg, height_cm):
    if weight_kg is None or height_cm is None or float(height_cm) <= 0:
        return None

    height_m = float(height_cm) / 100
    bmi = round(float(weight_kg) / (height_m * height_m), 1)

    if bmi < 18.5:
        category = "Underweight"
    elif bmi < 25:
        category = "Normal"
    elif bmi < 30:
        category = "Overweight"
    else:
        category = "Obese"

    return "BMI " + str(bmi) + " (" + category + ")"


# This turns "Mohamed Gamal Ali" into "Mohamed A." so reviews do not show full names
def short_name(full_name):
    parts = full_name.split()

    if len(parts) == 0:
        return "Member"

    if len(parts) == 1:
        return parts[0]

    return parts[0] + " " + parts[-1][0] + "."


# This checks if a member had a session booked with a coach or chose the coach in a membership
def can_review_coach(user_id, coach_id):
    rows = read_rows(
        "SELECT "
        "(SELECT COUNT(*) FROM coach_slots WHERE coach_id = %s AND booked_by = %s) + "
        "(SELECT COUNT(*) FROM memberships WHERE coach_id = %s AND user_id = %s) AS total",
        (coach_id, user_id, coach_id, user_id)
    )
    return rows[0]["total"] > 0


# This writes what a member told us about their fitness as one line for the admin
def make_profile_text(row):
    # No row at all means the member never answered
    if row["profile_user_id"] is None:
        return "Not provided"

    parts = []

    if row["goal"]:
        parts.append(row["goal"])

    if row["weight_kg"] is not None:
        parts.append(str(row["weight_kg"]) + " kg")

    if row["height_cm"] is not None:
        parts.append(str(row["height_cm"]) + " cm")

    bmi_text = make_bmi_text(row["weight_kg"], row["height_cm"])
    if bmi_text is not None:
        parts.append(bmi_text)

    if row["experience"]:
        parts.append(row["experience"])

    # A row with nothing in it means the member skipped the questions
    if len(parts) == 0:
        return "Skipped"

    return " | ".join(parts)


# This reads a number that must be between a minimum and a maximum
# It gives back (number or None, True if the number is bad)
def read_number(value, minimum, maximum):
    if value is None or str(value).strip() == "":
        return None, False

    try:
        number = Decimal(str(value).strip())
    except Exception:
        return None, True

    if number < minimum or number > maximum:
        return None, True

    return number, False


# ----------------------------------------------------------------------
# Accounts: register, login, logout, who am I
# ----------------------------------------------------------------------

# This runs when someone creates a new account
@app.route("/api/register", methods=["POST"])
def register():
    data = request.get_json()
    full_name = (data.get("full_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    # Check that nothing is empty
    if full_name == "" or email == "" or password == "":
        return jsonify({"message": "Please fill in all the fields."}), 400

    # Check that the password is long enough
    if len(password) < 6:
        return jsonify({"message": "Password must be at least 6 characters."}), 400

    connection = connect_to_database()
    cursor = connection.cursor()

    # Check if this email is already used
    cursor.execute("SELECT user_id FROM users WHERE email = %s", (email,))
    found = cursor.fetchone()
    if found:
        cursor.close()
        connection.close()
        return jsonify({"message": "This email is already registered."}), 400

    # Turn the password into a safe hashed password
    password_bytes = password.encode("utf-8")
    hashed_password = bcrypt.hashpw(password_bytes, bcrypt.gensalt())

    # Save the new member in the database
    cursor.execute(
        "INSERT INTO users (full_name, email, password_hash, role) VALUES (%s, %s, %s, %s)",
        (full_name, email, hashed_password.decode("utf-8"), "member")
    )
    connection.commit()
    cursor.close()
    connection.close()

    return jsonify({"message": "Account created! You can log in now."})


# This runs when someone logs in
@app.route("/api/login", methods=["POST"])
def login():
    data = request.get_json()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    connection = connect_to_database()
    cursor = connection.cursor(dictionary=True)

    # Look for this email in the database
    cursor.execute("SELECT * FROM users WHERE email = %s", (email,))
    user = cursor.fetchone()
    cursor.close()
    connection.close()

    # If the email does not exist, stop here
    if user is None:
        return jsonify({"message": "Wrong email or password."}), 401

    # Check the password against the hashed one in the database
    password_bytes = password.encode("utf-8")
    saved_hash = user["password_hash"].encode("utf-8")
    password_is_correct = bcrypt.checkpw(password_bytes, saved_hash)

    if not password_is_correct:
        return jsonify({"message": "Wrong email or password."}), 401

    # Remember this person as logged in
    session["user_id"] = user["user_id"]
    session["full_name"] = user["full_name"]
    session["role"] = user["role"]

    return jsonify({
        "message": "Login successful.",
        "role": user["role"],
        "full_name": user["full_name"]
    })


# This runs when someone logs out
@app.route("/api/logout", methods=["POST"])
def logout():
    session.clear()
    return jsonify({"message": "You are logged out."})


# This tells the page who is logged in right now
@app.route("/api/me")
def who_am_i():
    if "user_id" not in session:
        return jsonify({"logged_in": False})

    return jsonify({
        "logged_in": True,
        "user_id": session["user_id"],
        "full_name": session["full_name"],
        "role": session["role"]
    })


# ----------------------------------------------------------------------
# Forgot password (demo: the reset code is shown on the screen)
# ----------------------------------------------------------------------

# This creates a reset code for a member
@app.route("/api/forgot-password", methods=["POST"])
def forgot_password():
    data = request.get_json()
    email = (data.get("email") or "").strip().lower()

    if email == "":
        return jsonify({"message": "Please type your email."}), 400

    connection = connect_to_database()
    cursor = connection.cursor(dictionary=True)

    # Only member accounts can be reset this way
    cursor.execute(
        "SELECT user_id FROM users WHERE email = %s AND role = 'member'",
        (email,)
    )
    user = cursor.fetchone()

    if user is None:
        cursor.close()
        connection.close()
        return jsonify({"message": "No member account uses this email."}), 404

    # Make a random 6 digit code that works for 15 minutes
    reset_code = str(secrets.randbelow(900000) + 100000)
    cursor.execute(
        "UPDATE users SET reset_code = %s, reset_expires = DATE_ADD(NOW(), INTERVAL 15 MINUTE) "
        "WHERE user_id = %s",
        (reset_code, user["user_id"])
    )
    connection.commit()
    cursor.close()
    connection.close()

    return jsonify({
        "message": "Reset code created.",
        "reset_code": reset_code
    })


# This sets a new password if the code is right
@app.route("/api/reset-password", methods=["POST"])
def reset_password():
    data = request.get_json()
    email = (data.get("email") or "").strip().lower()
    reset_code = (data.get("reset_code") or "").strip()
    new_password = data.get("new_password") or ""

    if len(new_password) < 6:
        return jsonify({"message": "The new password must be at least 6 characters."}), 400

    connection = connect_to_database()
    cursor = connection.cursor(dictionary=True)

    # Check the email, the code and that the code did not expire
    cursor.execute(
        "SELECT user_id FROM users WHERE email = %s AND role = 'member' "
        "AND reset_code = %s AND reset_expires >= NOW()",
        (email, reset_code)
    )
    user = cursor.fetchone()

    if user is None:
        cursor.close()
        connection.close()
        return jsonify({"message": "The code is wrong or has expired."}), 400

    # Save the new password and delete the code
    new_hash = bcrypt.hashpw(new_password.encode("utf-8"), bcrypt.gensalt())
    cursor.execute(
        "UPDATE users SET password_hash = %s, reset_code = NULL, reset_expires = NULL "
        "WHERE user_id = %s",
        (new_hash.decode("utf-8"), user["user_id"])
    )
    connection.commit()
    cursor.close()
    connection.close()

    return jsonify({"message": "Your password was changed."})


# ----------------------------------------------------------------------
# Public information: plans, coaches, schedules, offers
# ----------------------------------------------------------------------

# This sends all membership plans to the page
@app.route("/api/plans")
def get_plans():
    connection = connect_to_database()
    cursor = connection.cursor(dictionary=True)
    cursor.execute("SELECT * FROM plans ORDER BY duration_months")
    plans = cursor.fetchall()
    cursor.close()
    connection.close()
    return jsonify(plans)


# This sends all coaches to the page (with their average rating)
@app.route("/api/coaches")
def get_coaches():
    coaches = read_rows(
        "SELECT c.*, "
        "(SELECT ROUND(AVG(r.rating), 1) FROM coach_reviews r WHERE r.coach_id = c.coach_id) AS avg_rating, "
        "(SELECT COUNT(*) FROM coach_reviews r WHERE r.coach_id = c.coach_id) AS review_count "
        "FROM coaches c ORDER BY c.coach_id"
    )

    for coach in coaches:
        if coach["avg_rating"] is not None:
            coach["avg_rating"] = str(coach["avg_rating"])

    return jsonify(coaches)


# This sends the session times of one coach
@app.route("/api/coaches/<int:coach_id>/slots")
def get_coach_slots(coach_id):
    # Find out who is asking (0 means nobody is logged in)
    current_user_id = session.get("user_id", 0)

    connection = connect_to_database()
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        "SELECT slot_id, slot_date, slot_time, booked_by FROM coach_slots "
        "WHERE coach_id = %s AND slot_date >= CURDATE() "
        "ORDER BY slot_date, slot_time",
        (coach_id,)
    )
    rows = cursor.fetchall()
    cursor.close()
    connection.close()

    slots = []
    for row in rows:
        # Say if it is booked, and if it is booked by this person
        is_booked = row["booked_by"] is not None
        is_mine = row["booked_by"] == current_user_id

        slots.append({
            "slot_id": row["slot_id"],
            "slot_date": row["slot_date"].strftime("%a %d %b %Y"),
            "slot_time": make_time_text(row["slot_time"]),
            "is_booked": is_booked,
            "is_mine": is_mine
        })

    return jsonify(slots)


# This sends the offers that have not ended yet
@app.route("/api/offers")
def get_offers():
    connection = connect_to_database()
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        "SELECT offer_id, title, description, discount_percent, promo_code, end_date "
        "FROM offers WHERE end_date IS NULL OR end_date >= CURDATE()"
    )
    offers = cursor.fetchall()
    cursor.close()
    connection.close()

    # Turn each end date into text like 20 Jan 2027
    for offer in offers:
        if offer["end_date"] is not None:
            offer["end_date"] = offer["end_date"].strftime("%d %b %Y")

    return jsonify(offers)


# ----------------------------------------------------------------------
# Session bookings (members only)
# ----------------------------------------------------------------------

# This books a session time for the logged in member
@app.route("/api/book-slot", methods=["POST"])
def book_slot():
    # Only logged in members can book
    if "user_id" not in session:
        return jsonify({"message": "Please log in first."}), 401

    if session["role"] != "member":
        return jsonify({"message": "Only members can book sessions."}), 403

    data = request.get_json()
    slot_id = data.get("slot_id")

    connection = connect_to_database()
    cursor = connection.cursor()

    # Members need an active membership to book sessions
    cursor.execute(
        "SELECT membership_id FROM memberships "
        "WHERE user_id = %s AND status = 'active' AND end_date >= CURDATE() LIMIT 1",
        (session["user_id"],)
    )
    has_membership = cursor.fetchone()
    if not has_membership:
        cursor.close()
        connection.close()
        return jsonify({"message": "You need an active membership to book sessions. Please choose a plan first."}), 403

    # Book the time only if nobody else took it
    cursor.execute(
        "UPDATE coach_slots SET booked_by = %s "
        "WHERE slot_id = %s AND booked_by IS NULL AND slot_date >= CURDATE()",
        (session["user_id"], slot_id)
    )
    connection.commit()
    was_booked = cursor.rowcount == 1
    cursor.close()
    connection.close()

    if not was_booked:
        return jsonify({"message": "Sorry, this time is no longer available."}), 400

    return jsonify({"message": "Session booked! See you at the gym."})


# This sends the bookings of the logged in member
@app.route("/api/my-bookings")
def my_bookings():
    if "user_id" not in session:
        return jsonify({"message": "Please log in first."}), 401

    connection = connect_to_database()
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        "SELECT s.slot_id, s.slot_date, s.slot_time, "
        "(s.slot_date >= CURDATE()) AS is_upcoming, "
        "c.coach_name, c.specialization "
        "FROM coach_slots s JOIN coaches c ON s.coach_id = c.coach_id "
        "WHERE s.booked_by = %s ORDER BY s.slot_date, s.slot_time",
        (session["user_id"],)
    )
    rows = cursor.fetchall()
    cursor.close()
    connection.close()

    bookings = []
    for row in rows:
        bookings.append({
            "slot_id": row["slot_id"],
            "coach_name": row["coach_name"],
            "specialization": row["specialization"],
            "slot_date": row["slot_date"].strftime("%a %d %b %Y"),
            "slot_time": make_time_text(row["slot_time"]),
            "is_upcoming": row["is_upcoming"] == 1
        })

    return jsonify(bookings)


# This cancels a booking of the logged in member
@app.route("/api/cancel-booking", methods=["POST"])
def cancel_booking():
    if "user_id" not in session:
        return jsonify({"message": "Please log in first."}), 401

    data = request.get_json()
    slot_id = data.get("slot_id")

    connection = connect_to_database()
    cursor = connection.cursor()

    # Free the time only if it belongs to this member and has not passed
    cursor.execute(
        "UPDATE coach_slots SET booked_by = NULL "
        "WHERE slot_id = %s AND booked_by = %s AND slot_date >= CURDATE()",
        (slot_id, session["user_id"])
    )
    connection.commit()
    was_cancelled = cursor.rowcount == 1
    cursor.close()
    connection.close()

    if not was_cancelled:
        return jsonify({"message": "This session cannot be cancelled."}), 400

    return jsonify({"message": "Your session was cancelled."})


# ----------------------------------------------------------------------
# Profile (logged in people)
# ----------------------------------------------------------------------

# This sends the name and email of the logged in person
@app.route("/api/profile")
def get_profile():
    if "user_id" not in session:
        return jsonify({"message": "Please log in first."}), 401

    connection = connect_to_database()
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        "SELECT full_name, email FROM users WHERE user_id = %s",
        (session["user_id"],)
    )
    profile = cursor.fetchone()
    cursor.close()
    connection.close()

    return jsonify(profile)


# This saves a new name and email for the logged in person
@app.route("/api/update-profile", methods=["POST"])
def update_profile():
    if "user_id" not in session:
        return jsonify({"message": "Please log in first."}), 401

    data = request.get_json()
    full_name = (data.get("full_name") or "").strip()
    email = (data.get("email") or "").strip().lower()

    if full_name == "" or email == "":
        return jsonify({"message": "Please fill in your name and email."}), 400

    connection = connect_to_database()
    cursor = connection.cursor()

    # Check that nobody else uses this email
    cursor.execute(
        "SELECT user_id FROM users WHERE email = %s AND user_id != %s",
        (email, session["user_id"])
    )
    found = cursor.fetchone()
    if found:
        cursor.close()
        connection.close()
        return jsonify({"message": "This email is used by another account."}), 400

    # Save the new details
    cursor.execute(
        "UPDATE users SET full_name = %s, email = %s WHERE user_id = %s",
        (full_name, email, session["user_id"])
    )
    connection.commit()
    cursor.close()
    connection.close()

    session["full_name"] = full_name
    return jsonify({"message": "Your profile was updated."})


# This changes the password of the logged in person
@app.route("/api/change-password", methods=["POST"])
def change_password():
    if "user_id" not in session:
        return jsonify({"message": "Please log in first."}), 401

    data = request.get_json()
    current_password = data.get("current_password") or ""
    new_password = data.get("new_password") or ""

    if len(new_password) < 6:
        return jsonify({"message": "The new password must be at least 6 characters."}), 400

    connection = connect_to_database()
    cursor = connection.cursor(dictionary=True)

    # Get the saved password
    cursor.execute(
        "SELECT password_hash FROM users WHERE user_id = %s",
        (session["user_id"],)
    )
    user = cursor.fetchone()

    # Check the current password
    current_bytes = current_password.encode("utf-8")
    saved_hash = user["password_hash"].encode("utf-8")
    if not bcrypt.checkpw(current_bytes, saved_hash):
        cursor.close()
        connection.close()
        return jsonify({"message": "Your current password is wrong."}), 400

    # Save the new password as a hashed password
    new_bytes = new_password.encode("utf-8")
    new_hash = bcrypt.hashpw(new_bytes, bcrypt.gensalt())
    cursor.execute(
        "UPDATE users SET password_hash = %s WHERE user_id = %s",
        (new_hash.decode("utf-8"), session["user_id"])
    )
    connection.commit()
    cursor.close()
    connection.close()

    return jsonify({"message": "Your password was changed."})


# ----------------------------------------------------------------------
# Checkout and payment (members only)
# ----------------------------------------------------------------------

# This checks a promo code and tells the page the discount
@app.route("/api/check-promo", methods=["POST"])
def check_promo():
    data = request.get_json()
    promo_code = (data.get("promo_code") or "").strip().upper()

    if promo_code == "":
        return jsonify({"message": "Please type a promo code."}), 400

    offer = find_offer_by_code(promo_code)
    if offer is None:
        return jsonify({"message": "This promo code is not valid or has ended."}), 400

    # First-order codes only work for people who never ordered before
    if offer["first_order_only"] == 1:
        if "user_id" not in session:
            return jsonify({"message": "Please log in to use this code."}), 401

        if member_has_ordered_before(session["user_id"]):
            return jsonify({"message": "This promo code is only for your first order."}), 400

    return jsonify({
        "message": "Promo code applied: " + offer["title"],
        "discount_percent": offer["discount_percent"]
    })


# This takes the (fake) payment and creates the membership
@app.route("/api/checkout", methods=["POST"])
def checkout():
    if "user_id" not in session:
        return jsonify({"message": "Please log in first."}), 401

    if session["role"] != "member":
        return jsonify({"message": "Only members can buy a membership."}), 403

    data = request.get_json()
    plan_id = data.get("plan_id")
    coach_id = data.get("coach_id")
    promo_code = (data.get("promo_code") or "").strip().upper()
    payment_method = (data.get("payment_method") or "").strip()
    card_number = (data.get("card_number") or "").replace(" ", "")

    # Check the payment method
    if payment_method not in ("Card", "Mobile Wallet"):
        return jsonify({"message": "Please choose a payment method."}), 400

    # Check the fake card (we never save the card number)
    if payment_method == "Card":
        if len(card_number) != 16 or not card_number.isdigit():
            return jsonify({"message": "Please enter a valid 16 digit card number."}), 400

        # Test rule: cards ending in 0000 are declined
        if card_number.endswith("0000"):
            return jsonify({"message": "Payment declined. Please try another card."}), 400

    connection = connect_to_database()
    cursor = connection.cursor(dictionary=True)

    # Check that the member does not already have an active membership
    cursor.execute(
        "SELECT end_date FROM memberships "
        "WHERE user_id = %s AND status = 'active' AND end_date >= CURDATE()",
        (session["user_id"],)
    )
    active_membership = cursor.fetchone()
    if active_membership:
        cursor.close()
        connection.close()
        end_text = active_membership["end_date"].strftime("%d %b %Y")
        return jsonify({"message": "You already have an active membership until " + end_text + "."}), 400

    # Find the plan
    cursor.execute("SELECT * FROM plans WHERE plan_id = %s", (plan_id,))
    plan = cursor.fetchone()
    if plan is None:
        cursor.close()
        connection.close()
        return jsonify({"message": "This plan does not exist."}), 400

    # Find the coach (a coach is optional)
    coach_name = "No coach"
    if coach_id in (None, ""):
        coach_id = None
    else:
        cursor.execute("SELECT coach_name FROM coaches WHERE coach_id = %s", (coach_id,))
        coach = cursor.fetchone()
        if coach is None:
            cursor.close()
            connection.close()
            return jsonify({"message": "This coach does not exist."}), 400
        coach_name = coach["coach_name"]

    # Check the promo code (it is optional)
    offer_id = None
    discount_percent = 0
    if promo_code != "":
        offer = find_offer_by_code(promo_code)
        if offer is None:
            cursor.close()
            connection.close()
            return jsonify({"message": "This promo code is not valid or has ended."}), 400
        if offer["first_order_only"] == 1 and member_has_ordered_before(session["user_id"]):
            cursor.close()
            connection.close()
            return jsonify({"message": "This promo code is only for your first order."}), 400

        offer_id = offer["offer_id"]
        discount_percent = offer["discount_percent"]

    # Work out the price (the backend always does this itself)
    price = plan["price"]
    discount_amount = (price * discount_percent / 100).quantize(Decimal("0.01"))
    total = price - discount_amount

    # Work out the dates
    start_date = date.today()
    end_date = add_months(start_date, plan["duration_months"])

    # Save the membership and the payment together
    try:
        cursor.execute(
            "INSERT INTO memberships (user_id, plan_id, coach_id, offer_id, start_date, end_date, status) "
            "VALUES (%s, %s, %s, %s, %s, %s, 'active')",
            (session["user_id"], plan["plan_id"], coach_id, offer_id, start_date, end_date)
        )
        membership_id = cursor.lastrowid

        cursor.execute(
            "INSERT INTO payments (user_id, membership_id, amount, payment_method, payment_status) "
            "VALUES (%s, %s, %s, %s, 'paid')",
            (session["user_id"], membership_id, total, payment_method)
        )
        payment_id = cursor.lastrowid

        connection.commit()
    except Exception as error:
        connection.rollback()
        cursor.close()
        connection.close()
        print(error)
        return jsonify({"message": "Something went wrong. Please try again."}), 500

    cursor.close()
    connection.close()

    return jsonify({
        "message": "Payment successful! Your membership is active.",
        "receipt_number": payment_id,
        "plan_name": plan["plan_name"],
        "coach_name": coach_name,
        "amount": str(total),
        "start_date": start_date.strftime("%d %b %Y"),
        "end_date": end_date.strftime("%d %b %Y")
    })


# This sends all memberships of the logged in member
@app.route("/api/my-memberships")
def my_memberships():
    if "user_id" not in session:
        return jsonify({"message": "Please log in first."}), 401

    rows = read_rows(
        "SELECT m.membership_id, p.plan_name, c.coach_name, m.start_date, m.end_date, "
        "DATEDIFF(m.end_date, CURDATE()) AS days_left, "
        "CASE WHEN m.status = 'cancelled' THEN 'cancelled' "
        "WHEN m.end_date < CURDATE() THEN 'expired' ELSE 'active' END AS current_status, "
        "pay.amount AS paid_amount, pay.refund_amount "
        "FROM memberships m JOIN plans p ON m.plan_id = p.plan_id "
        "LEFT JOIN coaches c ON m.coach_id = c.coach_id "
        "LEFT JOIN payments pay ON pay.membership_id = m.membership_id "
        "WHERE m.user_id = %s ORDER BY m.start_date DESC, m.membership_id DESC",
        (session["user_id"],)
    )

    for row in rows:
        # Work out how much would be refunded if the member cancels now
        refund_estimate = Decimal("0.00")
        if row["current_status"] == "active":
            refund_estimate = calculate_refund(row["paid_amount"], row["start_date"], row["end_date"])

        row["refund_estimate"] = str(refund_estimate)

        # Turn the numbers and dates into text
        if row["paid_amount"] is not None:
            row["paid_amount"] = str(row["paid_amount"])
        if row["refund_amount"] is not None:
            row["refund_amount"] = str(row["refund_amount"])

        row["start_date"] = row["start_date"].strftime("%d %b %Y")
        row["end_date"] = row["end_date"].strftime("%d %b %Y")

    return jsonify(rows)


# This cancels the active membership of the logged in member and refunds the unused days
@app.route("/api/cancel-membership", methods=["POST"])
def cancel_membership():
    if "user_id" not in session:
        return jsonify({"message": "Please log in first."}), 401

    if session["role"] != "member":
        return jsonify({"message": "Only members have memberships."}), 403

    data = request.get_json()
    refund, error_message = cancel_membership_with_refund(data.get("membership_id"), session["user_id"])

    if error_message is not None:
        return jsonify({"message": error_message}), 400

    return jsonify({
        "message": "Your membership was cancelled. A refund of " + str(refund) + " was sent back to your payment method, and your upcoming sessions were cancelled.",
        "refund_amount": str(refund)
    })


# This tells the page if a first-order promo code can be suggested to this person
@app.route("/api/first-order-offer")
def first_order_offer():
    # Admins never see this
    if session.get("role") == "admin":
        return jsonify({"has_offer": False})

    # Members who already ordered do not get a first-order offer
    if "user_id" in session and member_has_ordered_before(session["user_id"]):
        return jsonify({"has_offer": False})

    rows = read_rows(
        "SELECT title, discount_percent, promo_code FROM offers "
        "WHERE first_order_only = 1 AND promo_code IS NOT NULL "
        "AND (end_date IS NULL OR end_date >= CURDATE()) "
        "ORDER BY discount_percent DESC LIMIT 1"
    )

    if len(rows) == 0:
        return jsonify({"has_offer": False})

    return jsonify({
        "has_offer": True,
        "title": rows[0]["title"],
        "discount_percent": rows[0]["discount_percent"],
        "promo_code": rows[0]["promo_code"]
    })


# This sends all payments of the logged in member
@app.route("/api/my-payments")
def my_payments():
    if "user_id" not in session:
        return jsonify({"message": "Please log in first."}), 401

    connection = connect_to_database()
    cursor = connection.cursor(dictionary=True)
    cursor.execute(
        "SELECT pay.payment_id, pay.amount, pay.payment_method, pay.payment_status, "
        "pay.refund_amount, pay.payment_date, p.plan_name "
        "FROM payments pay "
        "JOIN memberships m ON pay.membership_id = m.membership_id "
        "JOIN plans p ON m.plan_id = p.plan_id "
        "WHERE pay.user_id = %s ORDER BY pay.payment_date DESC, pay.payment_id DESC",
        (session["user_id"],)
    )
    rows = cursor.fetchall()
    cursor.close()
    connection.close()

    # Turn the numbers and dates into text
    for row in rows:
        row["amount"] = str(row["amount"])
        if row["refund_amount"] is not None:
            row["refund_amount"] = str(row["refund_amount"])
        row["payment_date"] = row["payment_date"].strftime("%d %b %Y, %H:%M")

    return jsonify(rows)


# ----------------------------------------------------------------------
# Coach reviews and ratings
# ----------------------------------------------------------------------

# This shows the reviews of a coach (anyone), saves a review or deletes it (members)
@app.route("/api/coaches/<int:coach_id>/reviews", methods=["GET", "POST", "DELETE"])
def coach_reviews(coach_id):
    # GET: everybody can read the reviews
    if request.method == "GET":
        rows = read_rows(
            "SELECT r.review_id, r.user_id, r.rating, r.review_text, r.created_at, u.full_name "
            "FROM coach_reviews r JOIN users u ON r.user_id = u.user_id "
            "WHERE r.coach_id = %s ORDER BY r.created_at DESC, r.review_id DESC",
            (coach_id,)
        )

        current_user_id = session.get("user_id", 0)
        reviews = []
        total_stars = 0
        my_review = None

        for row in rows:
            total_stars = total_stars + row["rating"]

            review = {
                "review_id": row["review_id"],
                "reviewer": short_name(row["full_name"]),
                "rating": row["rating"],
                "review_text": row["review_text"],
                "created_at": row["created_at"].strftime("%d %b %Y"),
                "is_mine": row["user_id"] == current_user_id
            }
            reviews.append(review)

            if review["is_mine"]:
                my_review = review

        average_rating = None
        if len(reviews) > 0:
            average_rating = round(total_stars / len(reviews), 1)

        # Work out if this person may write a review
        is_member = session.get("role") == "member"
        can_review = False
        if is_member:
            can_review = my_review is not None or can_review_coach(session["user_id"], coach_id)

        return jsonify({
            "reviews": reviews,
            "review_count": len(reviews),
            "avg_rating": average_rating,
            "logged_in": "user_id" in session,
            "is_member": is_member,
            "can_review": can_review,
            "my_review": my_review
        })

    # POST and DELETE need a logged in member
    if "user_id" not in session:
        return jsonify({"message": "Please log in first."}), 401

    if session["role"] != "member":
        return jsonify({"message": "Only members can write reviews."}), 403

    user_id = session["user_id"]

    # DELETE: remove the review of this member
    if request.method == "DELETE":
        change_database(
            "DELETE FROM coach_reviews WHERE coach_id = %s AND user_id = %s",
            (coach_id, user_id)
        )
        return jsonify({"message": "Your review was deleted."})

    # POST: save the review
    data = request.get_json() or {}

    try:
        rating = int(data.get("rating"))
    except (TypeError, ValueError):
        return jsonify({"message": "Please choose a rating from 1 to 5 stars."}), 400

    if rating < 1 or rating > 5:
        return jsonify({"message": "Please choose a rating from 1 to 5 stars."}), 400

    review_text = (data.get("review_text") or "").strip()
    if len(review_text) > 500:
        return jsonify({"message": "Your review is too long (500 characters at most)."}), 400

    if review_text == "":
        review_text = None

    coach = read_rows("SELECT coach_id FROM coaches WHERE coach_id = %s", (coach_id,))
    if len(coach) == 0:
        return jsonify({"message": "This coach does not exist."}), 404

    # Members who already reviewed can always change their review
    # Other members need a session with this coach, or the coach in their membership
    existing = read_rows(
        "SELECT review_id FROM coach_reviews WHERE coach_id = %s AND user_id = %s",
        (coach_id, user_id)
    )
    if len(existing) == 0 and not can_review_coach(user_id, coach_id):
        return jsonify({"message": "You can review a coach after you book a session with them or choose them as your coach."}), 403

    change_database(
        "INSERT INTO coach_reviews (coach_id, user_id, rating, review_text) VALUES (%s, %s, %s, %s) "
        "ON DUPLICATE KEY UPDATE rating = VALUES(rating), review_text = VALUES(review_text), created_at = NOW()",
        (coach_id, user_id, rating, review_text)
    )

    return jsonify({"message": "Thank you! Your review was saved."})


# ----------------------------------------------------------------------
# Fitness profile (members only, everything is optional)
# ----------------------------------------------------------------------

FITNESS_GOALS = ["Lose weight", "Build muscle", "Improve fitness", "Increase flexibility",
                 "Stay healthy", "Prepare for a sport", "Other"]
EXPERIENCE_LEVELS = ["Beginner", "Intermediate", "Advanced"]


# This sends or saves what a member told us about their weight, height and goal
@app.route("/api/fitness-profile", methods=["GET", "POST"])
def fitness_profile():
    if "user_id" not in session:
        return jsonify({"message": "Please log in first."}), 401

    if session["role"] != "member":
        return jsonify({"message": "Only members have a fitness profile."}), 403

    user_id = session["user_id"]

    # GET: send what we know, and say if we should ask the questions now
    if request.method == "GET":
        rows = read_rows(
            "SELECT weight_kg, height_cm, goal, experience, notes, skipped "
            "FROM member_profiles WHERE user_id = %s",
            (user_id,)
        )
        membership = read_rows(
            "SELECT membership_id FROM memberships "
            "WHERE user_id = %s AND status = 'active' AND end_date >= CURDATE() LIMIT 1",
            (user_id,)
        )

        result = {
            "ask_now": len(rows) == 0,
            "has_active_membership": len(membership) > 0,
            "weight_kg": None,
            "height_cm": None,
            "goal": None,
            "experience": None,
            "notes": None
        }

        if len(rows) > 0:
            if rows[0]["weight_kg"] is not None:
                result["weight_kg"] = str(rows[0]["weight_kg"])
            if rows[0]["height_cm"] is not None:
                result["height_cm"] = str(rows[0]["height_cm"])
            result["goal"] = rows[0]["goal"]
            result["experience"] = rows[0]["experience"]
            result["notes"] = rows[0]["notes"]

        return jsonify(result)

    # POST: the member skipped the questions
    data = request.get_json() or {}

    if data.get("skipped") in (True, 1, "1", "true"):
        change_database(
            "INSERT INTO member_profiles (user_id, skipped) VALUES (%s, 1) "
            "ON DUPLICATE KEY UPDATE skipped = skipped",
            (user_id,)
        )
        return jsonify({"message": "No problem, you can add this later from your dashboard."})

    # POST: the member answered (every answer is optional)
    weight, weight_is_bad = read_number(data.get("weight_kg"), 20, 300)
    if weight_is_bad:
        return jsonify({"message": "The weight must be a number between 20 and 300 kg."}), 400

    height, height_is_bad = read_number(data.get("height_cm"), 100, 250)
    if height_is_bad:
        return jsonify({"message": "The height must be a number between 100 and 250 cm."}), 400

    goal = (data.get("goal") or "").strip()
    if goal != "" and goal not in FITNESS_GOALS:
        return jsonify({"message": "Please choose a goal from the list."}), 400

    experience = (data.get("experience") or "").strip()
    if experience != "" and experience not in EXPERIENCE_LEVELS:
        return jsonify({"message": "Please choose your experience from the list."}), 400

    notes = (data.get("notes") or "").strip()
    if len(notes) > 500:
        return jsonify({"message": "The notes are too long (500 characters at most)."}), 400

    # Empty answers are saved as "nothing"
    goal = goal or None
    experience = experience or None
    notes = notes or None

    if weight is None and height is None and goal is None and experience is None and notes is None:
        return jsonify({"message": "Please fill in at least one answer, or skip this part."}), 400

    change_database(
        "INSERT INTO member_profiles (user_id, weight_kg, height_cm, goal, experience, notes, skipped) "
        "VALUES (%s, %s, %s, %s, %s, %s, 0) "
        "ON DUPLICATE KEY UPDATE weight_kg = VALUES(weight_kg), height_cm = VALUES(height_cm), "
        "goal = VALUES(goal), experience = VALUES(experience), notes = VALUES(notes), skipped = 0",
        (user_id, weight, height, goal, experience, notes)
    )

    return jsonify({"message": "Your fitness profile was saved."})


# ----------------------------------------------------------------------
# Contact us
# ----------------------------------------------------------------------

# This saves a message that a visitor wrote in the contact form
@app.route("/api/contact", methods=["POST"])
def send_contact_message():
    data = request.get_json() or {}
    full_name = (data.get("full_name") or "").strip()
    email = (data.get("email") or "").strip()
    subject = (data.get("subject") or "").strip()
    message_text = (data.get("message") or "").strip()

    if full_name == "" or email == "" or message_text == "":
        return jsonify({"message": "Please fill in your name, email and message."}), 400

    if "@" not in email or "." not in email:
        return jsonify({"message": "Please type a valid email address."}), 400

    if len(full_name) > 100 or len(email) > 100 or len(subject) > 150 or len(message_text) > 2000:
        return jsonify({"message": "One of your answers is too long."}), 400

    if subject == "":
        subject = None

    change_database(
        "INSERT INTO contact_messages (full_name, email, subject, message_text) VALUES (%s, %s, %s, %s)",
        (full_name, email, subject, message_text)
    )

    return jsonify({"message": "Thank you! We got your message and will reply soon."})


# ----------------------------------------------------------------------
# Admin only: coaches, plans and offers (they all work the same way)
# ----------------------------------------------------------------------

# For each table we list its columns and which ones must be filled in
ADMIN_TABLES = {
    "coaches": {
        "table": "coaches",
        "id_column": "coach_id",
        "order_by": "coach_id",
        "fields": ["coach_name", "specialization", "experience_years", "bio"],
        "required": ["coach_name", "specialization"]
    },
    "plans": {
        "table": "plans",
        "id_column": "plan_id",
        "order_by": "duration_months",
        "fields": ["plan_name", "duration_months", "price", "features"],
        "required": ["plan_name", "duration_months", "price"]
    },
    "offers": {
        "table": "offers",
        "id_column": "offer_id",
        "order_by": "offer_id",
        "fields": ["title", "description", "discount_percent", "promo_code", "end_date", "first_order_only"],
        "required": ["title", "discount_percent"]
    }
}


# This checks the numbers an admin typed (gives back a message, or None if all is fine)
def check_admin_values(table_name, values):
    try:
        if table_name == "plans":
            if int(values["duration_months"]) < 1:
                return "The duration must be at least 1 month."
            if Decimal(str(values["price"])) <= 0:
                return "The price must be more than 0."

        if table_name == "offers":
            percent = int(values["discount_percent"])
            if percent < 1 or percent > 100:
                return "The discount must be between 1 and 100."
            if values["end_date"] is not None:
                date.fromisoformat(values["end_date"])

        if table_name == "coaches" and values["experience_years"] is not None:
            if int(values["experience_years"]) < 0:
                return "Experience years cannot be negative."
    except Exception:
        return "Please check the values you typed."

    return None


# This reads the values an admin sent for one table (gives back values and a problem message)
def read_admin_values(table_name, config):
    data = request.get_json() or {}
    values = {}

    for field in config["fields"]:
        value = data.get(field)

        if isinstance(value, str):
            value = value.strip()

        if value == "":
            value = None

        values[field] = value

    # Check that the required fields are filled
    for field in config["required"]:
        if values[field] is None:
            return None, "Please fill in all the required fields."

    # Small clean ups
    if "promo_code" in values and values["promo_code"] is not None:
        values["promo_code"] = values["promo_code"].upper()

    if "first_order_only" in values:
        if values["first_order_only"] in (True, 1, "1", "true"):
            values["first_order_only"] = 1
        else:
            values["first_order_only"] = 0

    problem = check_admin_values(table_name, values)
    return values, problem


# This lists the rows of a table, or adds a new row
@app.route("/api/admin/data/<table_name>", methods=["GET", "POST"])
def admin_table(table_name):
    denied = admin_only()
    if denied is not None:
        return denied

    if table_name not in ADMIN_TABLES:
        return jsonify({"message": "Not found."}), 404

    config = ADMIN_TABLES[table_name]

    # GET: send all the rows
    if request.method == "GET":
        rows = read_rows("SELECT * FROM " + config["table"] + " ORDER BY " + config["order_by"])
        for row in rows:
            clean_row(row)
        return jsonify(rows)

    # POST: add a new row
    values, problem = read_admin_values(table_name, config)
    if problem is not None:
        return jsonify({"message": problem}), 400

    columns = ", ".join(config["fields"])
    placeholders = ", ".join(["%s"] * len(config["fields"]))
    params = [values[field] for field in config["fields"]]

    try:
        change_database(
            "INSERT INTO " + config["table"] + " (" + columns + ") VALUES (" + placeholders + ")",
            params
        )
    except Exception as error:
        print(error)
        return jsonify({"message": "Could not save. Please check the values (a promo code must be unique)."}), 400

    return jsonify({"message": "Saved successfully."})


# This changes or deletes one row of a table
@app.route("/api/admin/data/<table_name>/<int:record_id>", methods=["PUT", "DELETE"])
def admin_record(table_name, record_id):
    denied = admin_only()
    if denied is not None:
        return denied

    if table_name not in ADMIN_TABLES:
        return jsonify({"message": "Not found."}), 404

    config = ADMIN_TABLES[table_name]

    # DELETE: remove the row
    if request.method == "DELETE":
        try:
            change_database(
                "DELETE FROM " + config["table"] + " WHERE " + config["id_column"] + " = %s",
                (record_id,)
            )
        except Exception as error:
            print(error)
            return jsonify({"message": "This item is used by other records (for example plans that members bought), so it cannot be deleted."}), 400

        return jsonify({"message": "Deleted."})

    # PUT: save the changes
    values, problem = read_admin_values(table_name, config)
    if problem is not None:
        return jsonify({"message": problem}), 400

    set_text = ", ".join([field + " = %s" for field in config["fields"]])
    params = [values[field] for field in config["fields"]] + [record_id]

    try:
        change_database(
            "UPDATE " + config["table"] + " SET " + set_text + " WHERE " + config["id_column"] + " = %s",
            params
        )
    except Exception as error:
        print(error)
        return jsonify({"message": "Could not save. Please check the values (a promo code must be unique)."}), 400

    return jsonify({"message": "Saved successfully."})


# ----------------------------------------------------------------------
# Admin only: members
# ----------------------------------------------------------------------

# This lists all members, or adds a new member
@app.route("/api/admin/members", methods=["GET", "POST"])
def admin_members():
    denied = admin_only()
    if denied is not None:
        return denied

    # GET: send all members with their current plan
    if request.method == "GET":
        rows = read_rows(
            "SELECT u.user_id, u.full_name, u.email, u.created_at, "
            "(SELECT p.plan_name FROM memberships m JOIN plans p ON m.plan_id = p.plan_id "
            "WHERE m.user_id = u.user_id AND m.status = 'active' AND m.end_date >= CURDATE() "
            "ORDER BY m.end_date DESC LIMIT 1) AS active_plan "
            "FROM users u WHERE u.role = 'member' ORDER BY u.user_id DESC"
        )
        for row in rows:
            row["created_at"] = row["created_at"].strftime("%d %b %Y")
        return jsonify(rows)

    # POST: add a new member
    data = request.get_json() or {}
    full_name = (data.get("full_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if full_name == "" or email == "" or password == "":
        return jsonify({"message": "Please fill in the name, email and password."}), 400

    if len(password) < 6:
        return jsonify({"message": "The password must be at least 6 characters."}), 400

    found = read_rows("SELECT user_id FROM users WHERE email = %s", (email,))
    if len(found) > 0:
        return jsonify({"message": "This email is already registered."}), 400

    hashed_password = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())
    change_database(
        "INSERT INTO users (full_name, email, password_hash, role) VALUES (%s, %s, %s, 'member')",
        (full_name, email, hashed_password.decode("utf-8"))
    )

    return jsonify({"message": "Member added."})


# This changes or deletes one member
@app.route("/api/admin/members/<int:member_id>", methods=["PUT", "DELETE"])
def admin_member(member_id):
    denied = admin_only()
    if denied is not None:
        return denied

    # DELETE: remove the member (their memberships and payments go too)
    if request.method == "DELETE":
        affected, new_id = change_database(
            "DELETE FROM users WHERE user_id = %s AND role = 'member'",
            (member_id,)
        )
        if affected == 0:
            return jsonify({"message": "Member not found."}), 404

        return jsonify({"message": "Member deleted."})

    # PUT: save the changes
    data = request.get_json() or {}
    full_name = (data.get("full_name") or "").strip()
    email = (data.get("email") or "").strip().lower()
    password = data.get("password") or ""

    if full_name == "" or email == "":
        return jsonify({"message": "Please fill in the name and email."}), 400

    other = read_rows(
        "SELECT user_id FROM users WHERE email = %s AND user_id != %s",
        (email, member_id)
    )
    if len(other) > 0:
        return jsonify({"message": "This email is used by another account."}), 400

    if password != "":
        if len(password) < 6:
            return jsonify({"message": "The new password must be at least 6 characters."}), 400

        hashed_password = bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt())
        change_database(
            "UPDATE users SET full_name = %s, email = %s, password_hash = %s "
            "WHERE user_id = %s AND role = 'member'",
            (full_name, email, hashed_password.decode("utf-8"), member_id)
        )
    else:
        change_database(
            "UPDATE users SET full_name = %s, email = %s WHERE user_id = %s AND role = 'member'",
            (full_name, email, member_id)
        )

    return jsonify({"message": "Member saved."})


# ----------------------------------------------------------------------
# Admin only: session times and who booked them
# ----------------------------------------------------------------------

# This lists the session times (with who booked them), or adds a new session time
@app.route("/api/admin/slots", methods=["GET", "POST"])
def admin_slots():
    denied = admin_only()
    if denied is not None:
        return denied

    # GET: send the session times of the last 14 days and the future
    if request.method == "GET":
        rows = read_rows(
            "SELECT s.slot_id, s.coach_id, c.coach_name, s.slot_date, s.slot_time, s.booked_by, "
            "u.full_name, u.email, (s.slot_date >= CURDATE()) AS is_upcoming, "
            "mp.user_id AS profile_user_id, mp.weight_kg, mp.height_cm, mp.goal, mp.experience, mp.notes "
            "FROM coach_slots s JOIN coaches c ON s.coach_id = c.coach_id "
            "LEFT JOIN users u ON s.booked_by = u.user_id "
            "LEFT JOIN member_profiles mp ON mp.user_id = s.booked_by "
            "WHERE s.slot_date >= DATE_SUB(CURDATE(), INTERVAL 14 DAY) "
            "ORDER BY s.slot_date, s.slot_time"
        )

        slots = []
        for row in rows:
            is_booked = row["booked_by"] is not None
            booking_text = "Free"
            if is_booked:
                booking_text = row["full_name"] + " (" + row["email"] + ")"

            when_text = "Past"
            if row["is_upcoming"] == 1:
                when_text = "Upcoming"

            # What the member told us about their fitness (only for booked sessions)
            profile_text = "-"
            notes_text = None
            if is_booked:
                profile_text = make_profile_text(row)

                if row["notes"]:
                    notes_text = row["notes"]
                    if len(notes_text) > 60:
                        notes_text = notes_text[:60] + "..."

            slots.append({
                "slot_id": row["slot_id"],
                "coach_name": row["coach_name"],
                "slot_date": row["slot_date"].strftime("%a %d %b %Y"),
                "slot_time": make_time_text(row["slot_time"]),
                "is_booked": is_booked,
                "full_name": row["full_name"],
                "email": row["email"],
                "booking_text": booking_text,
                "when_text": when_text,
                "profile_text": profile_text,
                "notes_text": notes_text
            })

        return jsonify(slots)

    # POST: add a new session time
    data = request.get_json() or {}
    coach_id = data.get("coach_id")
    slot_date_text = data.get("slot_date")
    slot_time_text = data.get("slot_time")

    if not coach_id:
        return jsonify({"message": "Please choose a coach."}), 400

    try:
        slot_day = date.fromisoformat(slot_date_text)
        datetime.strptime(slot_time_text, "%H:%M")
    except (ValueError, TypeError):
        return jsonify({"message": "Please choose a valid date and time."}), 400

    if slot_day < date.today():
        return jsonify({"message": "The date cannot be in the past."}), 400

    # Do not allow the same coach at the same time twice
    already = read_rows(
        "SELECT slot_id FROM coach_slots WHERE coach_id = %s AND slot_date = %s AND slot_time = %s",
        (coach_id, slot_day, slot_time_text + ":00")
    )
    if len(already) > 0:
        return jsonify({"message": "This coach already has a session at that time."}), 400

    try:
        change_database(
            "INSERT INTO coach_slots (coach_id, slot_date, slot_time) VALUES (%s, %s, %s)",
            (coach_id, slot_day, slot_time_text + ":00")
        )
    except Exception as error:
        print(error)
        return jsonify({"message": "Could not add the session time."}), 400

    return jsonify({"message": "Session time added."})


# This deletes a session time
@app.route("/api/admin/slots/<int:slot_id>", methods=["DELETE"])
def admin_delete_slot(slot_id):
    denied = admin_only()
    if denied is not None:
        return denied

    change_database("DELETE FROM coach_slots WHERE slot_id = %s", (slot_id,))
    return jsonify({"message": "Session time deleted."})


# This cancels the booking of a session time (the time becomes free again)
@app.route("/api/admin/slots/<int:slot_id>/clear", methods=["POST"])
def admin_clear_slot(slot_id):
    denied = admin_only()
    if denied is not None:
        return denied

    change_database("UPDATE coach_slots SET booked_by = NULL WHERE slot_id = %s", (slot_id,))
    return jsonify({"message": "The booking was cancelled and the time is free again."})


# ----------------------------------------------------------------------
# Admin only: memberships, payments and numbers
# ----------------------------------------------------------------------

# This lists all memberships of all members
@app.route("/api/admin/memberships")
def admin_memberships():
    denied = admin_only()
    if denied is not None:
        return denied

    rows = read_rows(
        "SELECT m.membership_id, u.full_name, u.email, p.plan_name, c.coach_name, "
        "m.start_date, m.end_date, "
        "CASE WHEN m.status = 'cancelled' THEN 'cancelled' "
        "WHEN m.end_date < CURDATE() THEN 'expired' ELSE 'active' END AS current_status, "
        "pay.amount AS paid_amount, pay.refund_amount "
        "FROM memberships m JOIN users u ON m.user_id = u.user_id "
        "JOIN plans p ON m.plan_id = p.plan_id "
        "LEFT JOIN coaches c ON m.coach_id = c.coach_id "
        "LEFT JOIN payments pay ON pay.membership_id = m.membership_id "
        "ORDER BY m.membership_id DESC"
    )

    for row in rows:
        # Work out how much would be refunded if this membership is cancelled now
        refund_estimate = Decimal("0.00")
        if row["current_status"] == "active":
            refund_estimate = calculate_refund(row["paid_amount"], row["start_date"], row["end_date"])

        row["refund_estimate"] = str(refund_estimate)

        # Turn the numbers and dates into text
        if row["coach_name"] is None:
            row["coach_name"] = "No coach"
        if row["paid_amount"] is not None:
            row["paid_amount"] = str(row["paid_amount"])
        if row["refund_amount"] is not None:
            row["refund_amount"] = str(row["refund_amount"])

        row["start_date"] = row["start_date"].strftime("%d %b %Y")
        row["end_date"] = row["end_date"].strftime("%d %b %Y")

    return jsonify(rows)


# This lets the admin cancel a membership and refund the member
@app.route("/api/admin/memberships/<int:membership_id>/cancel", methods=["POST"])
def admin_cancel_membership(membership_id):
    denied = admin_only()
    if denied is not None:
        return denied

    refund, error_message = cancel_membership_with_refund(membership_id)

    if error_message is not None:
        return jsonify({"message": error_message}), 400

    return jsonify({
        "message": "Membership cancelled. A refund of " + str(refund) + " was given to the member.",
        "refund_amount": str(refund)
    })


# This lists all payments of all members
@app.route("/api/admin/payments")
def admin_payments():
    denied = admin_only()
    if denied is not None:
        return denied

    rows = read_rows(
        "SELECT pay.payment_id, u.full_name, u.email, p.plan_name, pay.amount, "
        "pay.payment_method, pay.payment_status, pay.refund_amount, pay.payment_date "
        "FROM payments pay JOIN users u ON pay.user_id = u.user_id "
        "JOIN memberships m ON pay.membership_id = m.membership_id "
        "JOIN plans p ON m.plan_id = p.plan_id "
        "ORDER BY pay.payment_date DESC, pay.payment_id DESC"
    )

    for row in rows:
        row["amount"] = str(row["amount"])
        if row["refund_amount"] is not None:
            row["refund_amount"] = str(row["refund_amount"])
        row["payment_date"] = row["payment_date"].strftime("%d %b %Y, %H:%M")

    return jsonify(rows)


# This sends the numbers for the admin overview
@app.route("/api/admin/stats")
def admin_stats():
    denied = admin_only()
    if denied is not None:
        return denied

    member_count = read_rows("SELECT COUNT(*) AS total FROM users WHERE role = 'member'")[0]["total"]

    active_membership_count = read_rows(
        "SELECT COUNT(*) AS total FROM memberships "
        "WHERE status = 'active' AND end_date >= CURDATE()"
    )[0]["total"]

    # Revenue is what members paid minus what we refunded
    revenue = read_rows(
        "SELECT COALESCE(SUM(amount - COALESCE(refund_amount, 0)), 0) AS total FROM payments "
        "WHERE payment_status IN ('paid', 'refunded')"
    )[0]["total"]

    refunds = read_rows(
        "SELECT COALESCE(SUM(refund_amount), 0) AS total FROM payments WHERE payment_status = 'refunded'"
    )[0]["total"]

    upcoming_session_count = read_rows(
        "SELECT COUNT(*) AS total FROM coach_slots "
        "WHERE booked_by IS NOT NULL AND slot_date >= CURDATE()"
    )[0]["total"]

    coach_count = read_rows("SELECT COUNT(*) AS total FROM coaches")[0]["total"]
    plan_count = read_rows("SELECT COUNT(*) AS total FROM plans")[0]["total"]

    unread_message_count = read_rows(
        "SELECT COUNT(*) AS total FROM contact_messages WHERE is_read = 0"
    )[0]["total"]

    return jsonify({
        "member_count": member_count,
        "active_membership_count": active_membership_count,
        "revenue": str(revenue),
        "refund_total": str(refunds),
        "upcoming_session_count": upcoming_session_count,
        "coach_count": coach_count,
        "plan_count": plan_count,
        "unread_message_count": unread_message_count
    })


# ----------------------------------------------------------------------
# Admin only: contact messages and reviews
# ----------------------------------------------------------------------

# This lists the messages people sent from the contact form
@app.route("/api/admin/messages")
def admin_messages():
    denied = admin_only()
    if denied is not None:
        return denied

    rows = read_rows(
        "SELECT message_id, full_name, email, subject, message_text, is_read, created_at "
        "FROM contact_messages ORDER BY created_at DESC, message_id DESC"
    )

    for row in rows:
        row["is_read"] = row["is_read"] == 1
        row["created_at"] = row["created_at"].strftime("%d %b %Y, %H:%M")

    return jsonify(rows)


# This marks a contact message as read
@app.route("/api/admin/messages/<int:message_id>/read", methods=["POST"])
def admin_read_message(message_id):
    denied = admin_only()
    if denied is not None:
        return denied

    change_database("UPDATE contact_messages SET is_read = 1 WHERE message_id = %s", (message_id,))
    return jsonify({"message": "Marked as read."})


# This deletes a contact message
@app.route("/api/admin/messages/<int:message_id>", methods=["DELETE"])
def admin_delete_message(message_id):
    denied = admin_only()
    if denied is not None:
        return denied

    change_database("DELETE FROM contact_messages WHERE message_id = %s", (message_id,))
    return jsonify({"message": "Message deleted."})


# This lists all coach reviews
@app.route("/api/admin/reviews")
def admin_reviews():
    denied = admin_only()
    if denied is not None:
        return denied

    rows = read_rows(
        "SELECT r.review_id, c.coach_name, u.full_name, r.rating, r.review_text, r.created_at "
        "FROM coach_reviews r JOIN coaches c ON r.coach_id = c.coach_id "
        "JOIN users u ON r.user_id = u.user_id "
        "ORDER BY r.created_at DESC, r.review_id DESC"
    )

    for row in rows:
        review_short = row["review_text"]
        if review_short is not None and len(review_short) > 80:
            review_short = review_short[:80] + "..."

        row["review_short"] = review_short
        row["created_at"] = row["created_at"].strftime("%d %b %Y")
        del row["review_text"]

    return jsonify(rows)


# This deletes a review (for example an unfair or rude one)
@app.route("/api/admin/reviews/<int:review_id>", methods=["DELETE"])
def admin_delete_review(review_id):
    denied = admin_only()
    if denied is not None:
        return denied

    change_database("DELETE FROM coach_reviews WHERE review_id = %s", (review_id,))
    return jsonify({"message": "Review deleted."})


# This starts the server (this must stay at the very bottom)
if __name__ == "__main__":
    app.run(debug=True)
