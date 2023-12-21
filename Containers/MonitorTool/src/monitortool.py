import pymongo
import time

# MongoDB connection settings
mongo_host = "dbstorage"
mongo_port = 27017
mongo_dbname = "cloneDetector"

# Connect to MongoDB
client = pymongo.MongoClient(mongo_host, mongo_port)
db = client[mongo_dbname]

while True:
    try:
        files_count = db["files"].count_documents({})
        chunks_count = db["chunks"].count_documents({})
        candidates_count = db["candidates"].count_documents({})
        clones_count = db["clones"].count_documents({})

        print("Files Count:", files_count)
        print("Chunks Count:", chunks_count)
        print("Candidates Count:", candidates_count)
        print("Clones Count:", clones_count)

        cursor = db["statusUpdates"].find().sort([("_id", pymongo.DESCENDING)]).limit(1)
        for update in cursor:
            print("New Status Update:")
            print("Timestamp:", update["timestamp"])
            print("Message:", update["message"])
            print("----------------------------")
        time.sleep(10)

    except Exception as e:
        print("Error:", str(e))
        time.sleep(10)
