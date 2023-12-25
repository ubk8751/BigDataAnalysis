import pymongo
import time
import threading
from flask import Flask, render_template, json
from jinja2 import Environment
import queue
import sys

mongo_host = "dbstorage"
mongo_port = 27017
mongo_dbname = "cloneDetector"

client = pymongo.MongoClient(mongo_host, mongo_port)
db = client[mongo_dbname]

data_points_queue = queue.Queue()
data_points = []

processing_times = {
    "Files": [],
    "Chunks": [],
    "Candidates": [],
    "Clones": []
}

avg_processing_times = {
    "Files": 0,
    "Chunks": 0,
    "Candidates": 0,
    "Clones": 0
}

f_count = 0
ch_count = 0
ca_count = 0
cl_count = 0
avg_processing_time = 0.0
avg_file_processing_time = 0.0
avg_chunk_processing_time = 0.0
avg_candidate_processing_time = 0.0
avg_clone_processing_time = 0.0

sleep_time = 10
global_start_time = 0
global_stop_time = "N/A"

latest_message = ""

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

def get_elapsed_time(start_time):
    current_time = time.time()
    elapsed_time_seconds = current_time - start_time

    hours, remainder = divmod(elapsed_time_seconds, 3600)
    minutes, remainder = divmod(remainder, 60)
    seconds, milliseconds = divmod(remainder, 1)

    time_str = f"{int(hours):02}:{int(minutes):02}:{int(seconds):02}:{int(milliseconds * 1000):03}"

    return time_str

def determine_processed_type(f_diff, ch_diff, ca_diff, cl_diff):
    if f_diff > 0:
        return "Files"
    elif ch_diff > 0:
        return "Chunks"
    elif ca_diff > 0:
        return "Candidates"
    elif cl_diff > 0:
        return "Clones"
    return None

def display_time(value):
    if value < 0.000001:
        return f"{value * 1e9:.2f}ns"
    elif value < 0.001:
        return f"{value * 1e6:.2f}μs"
    elif value < 0.1:
        return f"{value * 1e3:.2f}ms"
    else:
        return f"{value:.3f}s"

def calculate_statistics(processing_times, unit_type):
    if processing_times:
        counts, times = zip(*processing_times)
        mean_time = sum(times) / len(times)
        return mean_time
    return 0

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
        time.sleep(sleep_time)
        try:
            start_time = time.time()

            t_f_count = db["files"].count_documents({})
            t_ch_count = db["chunks"].count_documents({})
            t_ca_count = db["candidates"].count_documents({})
            t_cl_count = db["clones"].count_documents({})
            #chunks =db["chunks"].find({})

            #with open("chunkscontent.txt", "w") as file:
            #    file.write("Documents in 'chunks' collection:\n")
            #    for chunk in chunks:
            #        file.write(str(chunk) + "\n")


            diff = determine_processed_type(t_f_count - f_count, 
                                            t_ch_count - ch_count, 
                                            t_ca_count - ca_count, 
                                            t_cl_count - cl_count)
             
            f_count = t_f_count
            ch_count = t_ch_count
            ca_count = t_ca_count
            cl_count = t_cl_count

            type_count_map = {
                "Files": f_count,
                "Chunks": ch_count,
                "Candidates": ca_count,
                "Clones": cl_count
            }

            if f_count > 0 and diff is not None: 
                end_time = time.time()
                elapsed_time = end_time - start_time
                
                avg_processing_time = elapsed_time / type_count_map[diff]
                
                cur = db["statusUpdates"].find().sort([("_id", pymongo.DESCENDING)]).limit(1)
                t_message = latest_message
                for update in cur:
                    latest_message = update["message"]
                if type_count_map[diff] % 1000 == 0:
                    print(f't_{diff.lower()}_count: {type_count_map[diff]}')        
                processing_times[diff].append((type_count_map[diff], elapsed_time))
                for key in avg_processing_times.keys():
                    avg_processing_times[key] = calculate_statistics(processing_times[key], key)

                output = {
                    "Files Count": f_count,
                    "Chunks Count": ch_count,
                    "Candidates Count": ca_count,
                    "Clones Count": cl_count,
                    "Iteration Average Processing Time": avg_processing_time,
                    "Average File Processing Time": avg_processing_times["Files"],
                    "Average Chunk Processing Time": avg_processing_times["Chunks"],
                    "Average Candidate Processing Time": avg_processing_times["Candidates"],
                    "Average Clone Processing Time": avg_processing_times["Clones"],
                    "Latest Message": latest_message,
                }
                
                data_points_queue.put({
                    "type": diff,
                    "count": type_count_map[diff],
                    "time": avg_processing_time
                })
                
                print_time = False
                #for key in processing_times.keys():
                #    if diff == key and len(processing_times[key]) % (1 * 60 / sleep_time) == 0:
                #        print_time = True
                #        break
                
                if (print_time):
                    print(f'''
                            Files Count: {f_count}
                            Chunks Count: {ch_count}
                            Candidates Count: {ca_count}
                            Clones Count: {cl_count}
                            Iteration Average Processing Time: {avg_processing_time}s
                            Average File Processing Time: {avg_processing_times["Files"]}
                            Average Chunk Processing Time: {avg_processing_times["Chunks"]}
                            Average Candidate Processing Time: {avg_processing_times["Candidates"]}
                            Average Clone Processing Time: {avg_processing_times["Clones"]}
                            Latest Message: "{latest_message}"
                            --------------------------------------------------
                            ''')
                if latest_message == "Summary":
                    e_time = time.time()
                    hours, remainder = divmod(e_time, 3600)
                    minutes, remainder = divmod(remainder, 60)
                    seconds, milliseconds = divmod(remainder, 1)
                    global_stop_time
                    stop_monitoring = True # It'll continue the monitoring forever, but it will stop processing the data
        except Exception as e:
            print("Error:", str(e))

monitor_thread = threading.Thread(target=monitor)
monitor_thread.start()

app.jinja_env.filters['display_time'] = display_time

@app.route("/")
def home():
    global output
    global sleep_time
    global global_start_time
    data_points = list(data_points_queue.queue)
    return render_template(
        "index.html",
        output=output,
        data_points=data_points,
        sleep_time=sleep_time,
        g_elapsed_time=get_elapsed_time(global_start_time),
        g_stop_time=global_stop_time
    )

if __name__ == "__main__":
    global_start_time = time.time()
    app.run(debug=True, host='0.0.0.0', port=5000)
