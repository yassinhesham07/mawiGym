import mysql.connector


# This function opens a connection to the MySQL database
def connect_to_database():
    connection = mysql.connector.connect(
        host="localhost",
        user="root",
        password="gym12345",
        database="gym_db"
    )
    return connection