import pymongo
import time

# MongoDB connection settings
mongo_host = "dbstorage"
mongo_port = 27017
mongo_dbname = "cloneDetector"

# Connect to MongoDB
client = pymongo.MongoClient(mongo_host, mongo_port)
db = client[mongo_dbname]

# Initialize lists to store processing times
files_processing_times = []
chunks_processing_times = []
candidates_processing_times = []
clones_processing_times = []

def calculate_and_print_statistics(processing_times, unit_type):
    if processing_times:
        counts, times = zip(*processing_times)
        mean_time = sum(times) / len(times)
        print(f"Mean processing time for {unit_type}: {mean_time} seconds")

while True:
    try:
        start_time = time.time()

        f_count = db["files"].count_documents({})
        ch_count = db["chunks"].count_documents({})
        ca_count = db["candidates"].count_documents({})
        cl_count = db["clones"].count_documents({})
        if f_count > 0: 
            end_time = time.time()
            elapsed_time = end_time - start_time

            files_processing_times.append((f_count, elapsed_time))
            chunks_processing_times.append((ch_count, elapsed_time))
            candidates_processing_times.append((ca_count, elapsed_time))
            clones_processing_times.append((cl_count, elapsed_time))

            print("Files Count:", f_count)
            print("Chunks Count:", ch_count)
            print("Candidates Count:", ca_count)
            print("Clones Count:", cl_count)

            avg_file_processing_time = elapsed_time / f_count
            print(f"Average File Processing Time: {avg_file_processing_time} seconds")

            cur = db["statusUpdates"].find().sort([("_id", pymongo.DESCENDING)]).limit(1)
            for update in cur:
                print("Message:", update["message"])
            if len(files_processing_times) > 0 and len(files_processing_times) % (5 * 60 / 10) == 0:
                calculate_and_print_statistics(files_processing_times, "Files")
                calculate_and_print_statistics(chunks_processing_times, "Chunks")
                calculate_and_print_statistics(candidates_processing_times, "Candidates")
                calculate_and_print_statistics(clones_processing_times, "Clones")
            print("----------------------------")

    except Exception as e:
        print("Error:", str(e))
    
    time.sleep(10)



