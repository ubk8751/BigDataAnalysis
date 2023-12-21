from flask import Flask, render_template
from pymongo import MongoClient
import json

app = Flask(__name__)

# MongoDB connection settings
mongo_host = "dbstorage"  # Name of the service in Docker Compose
mongo_port = 27017
mongo_dbname = "cloneDetector"

# Function to fetch data from MongoDB collections
def fetch_data(collection_name):
    try:
        client = MongoClient(mongo_host, mongo_port)
        db = client[mongo_dbname]

        # Fetch data from the specified collection
        data = list(db[collection_name].find())

        return data

    except Exception as e:
        print("Error connecting to MongoDB:", str(e))
        return []

@app.route('/')
def index():
    # Fetch data from MongoDB collections
    files_data = fetch_data("files")
    chunks_data = fetch_data("chunks")
    candidates_data = fetch_data("candidates")
    clones_data = fetch_data("clones")

    # Convert data to JSON format for rendering on the web page
    files_data_json = json.dumps(files_data, default=str)
    chunks_data_json = json.dumps(chunks_data, default=str)
    candidates_data_json = json.dumps(candidates_data, default=str)
    clones_data_json = json.dumps(clones_data, default=str)

    return render_template('index.html', files_data=files_data_json, chunks_data=chunks_data_json,
                           candidates_data=candidates_data_json, clones_data=clones_data_json)

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
