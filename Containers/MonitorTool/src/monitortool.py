import pymongo
import time
import threading
from flask import Flask, render_template

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

# Global variables yolo
f_count = 0
ch_count = 0
ca_count = 0
cl_count = 0

avg_processing_time = 0.0

avg_file_processing_time = 0.0
avg_chunk_processing_time = 0.0
avg_candidate_processing_time = 0.0
avg_clone_processing_time = 0.0

latest_message = ""

data_points = []

output = {
    "Files Count": f_count,
    "Chunks Count": ch_count,
    "Candidates Count": ca_count,
    "Clones Count": cl_count,
    "Iteration Average Processing Time": avg_processing_time,
    "Average File Processing Time": avg_file_processing_time,
    "Average Chunk Processing Time": avg_chunk_processing_time,
    "Average Candidate Processing Time": avg_candidate_processing_time,
    "Average Clone Processing Time": avg_clone_processing_time,
    "Latest Message": latest_message,
}

app = Flask(__name__)

def calculate_and_print_statistics(processing_times, unit_type):
    if processing_times:
        counts, times = zip(*processing_times)
        mean_time = sum(times) / len(times)
        return mean_time
    return ""


def monitor():
    global output
    global f_count
    global ch_count
    global ca_count
    global cl_count
    global avg_processing_time
    global avg_file_processing_time
    global avg_chunk_processing_time
    global avg_candidate_processing_time
    global avg_clone_processing_time
    global latest_message
    global data_points

    stop_monitoring = ""

    while not stop_monitoring:
        time.sleep(10)
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

                avg_processing_time = elapsed_time / f_count

                cur = db["statusUpdates"].find().sort([("_id", pymongo.DESCENDING)]).limit(1)

                for update in cur:
                    latest_message = update["message"]
                if len(files_processing_times) > 0 and len(files_processing_times) % (5 * 60 / 10) == 0:
                    avg_file_processing_time = calculate_and_print_statistics(files_processing_times, "Files")
                    avg_chunk_processing_time = calculate_and_print_statistics(chunks_processing_times, "Chunks")
                    avg_candidate_processing = calculate_and_print_statistics(candidates_processing_times, "Candidates")
                    avg_clone_processing_time = calculate_and_print_statistics(clones_processing_times, "Clones")
                output = {
                    "Files Count": f_count,
                    "Chunks Count": ch_count,
                    "Candidates Count": ca_count,
                    "Clones Count": cl_count,
                    "Iteration Average Processing Time": avg_processing_time,
                    "Average File Processing Time": avg_file_processing_time,
                    "Average Chunk Processing Time": avg_chunk_processing_time,
                    "Average Candidate Processing Time": avg_candidate_processing_time,
                    "Average Clone Processing Time": avg_clone_processing_time,
                    "Latest Message": latest_message,
                }

                data_points.append(output)
                    
                if f_count > 0 and len(files_processing_times) % (2 * 60 / 10) == 0:
                    print(f'''
                            Files Count: {f_count}
                            Chunks Count: {ch_count}
                            Candidates Count: {ca_count}
                            Clones Count: {cl_count}
                            Iteration Average Processing Time: {avg_processing_time}s
                            Average File Processing Time: {avg_file_processing_time}
                            Average Chunk Processing Time: {avg_chunk_processing_time}
                            Average Candidate Processing Time: {avg_candidate_processing_time}
                            Average Clone Processing Time: {avg_clone_processing_time}
                            Latest Message: "{latest_message}"
                            --------------------------------------------------
                            ''')
                if latest_message == "Clone detection process complete.":
                    stop_monitoring = True
        except Exception as e:
            print("Error:", str(e))

monitor_thread = threading.Thread(target=monitor)
monitor_thread.start()

@app.route("/")
def home():
    global output
    return render_template("index.html", output=output)
    

if __name__ == "__main__":
    app.run(debug=True, host='0.0.0.0', port=5000)
