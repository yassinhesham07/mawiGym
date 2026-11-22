import mysql.connector

# HOW TO USE THIS FILE
# 1. Make a copy of this file in the same folder and name the copy database.py
# 2. In database.py, replace YOUR_PASSWORD with your own MySQL root password
# database.py is private: it is listed in .gitignore, so it is never uploaded to GitHub.


# This function opens a connection to the MySQL database
def connect_to_database():
    connection = mysql.connector.connect(
        host="localhost",
        user="root",
        password="YOUR_PASSWORD",
        database="gym_db"
    )
    return connection
