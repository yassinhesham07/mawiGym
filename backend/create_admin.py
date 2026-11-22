import bcrypt
from database import connect_to_database

# Change these three lines if you want a different admin
admin_name = "Gym Admin"
admin_email = "admin@gym.com"
admin_password = "Admin12345"

# Open the database
connection = connect_to_database()
cursor = connection.cursor()

# Check if this admin already exists
cursor.execute("SELECT user_id FROM users WHERE email = %s", (admin_email,))
found = cursor.fetchone()

if found:
    print("This admin already exists.")
else:
    # Turn the password into a safe hashed password
    password_bytes = admin_password.encode("utf-8")
    hashed_password = bcrypt.hashpw(password_bytes, bcrypt.gensalt())

    # Save the admin in the database
    cursor.execute(
        "INSERT INTO users (full_name, email, password_hash, role) VALUES (%s, %s, %s, %s)",
        (admin_name, admin_email, hashed_password.decode("utf-8"), "admin")
    )
    connection.commit()
    print("Admin account created.")

# Close everything
cursor.close()
connection.close()