import pymongo
import time
import threading
from flask import Flask, render_template, json
from jinja2 import Environment
import queue
import csv
import sys

SAVE_TO_FILE = True # if true, data and final state will be saved to files that can be extracted.

mongo_host = "dbstorage"
mongo_port = 27017
mongo_dbname = "cloneDetector"

client = pymongo.MongoClient(mongo_host, mongo_port)
db = client[mongo_dbname]

data_points_queue = queue.Queue()
sleep_time = 10
global_start_time = 0
global_stop_time = 0
avg_chunk_per_file = 0
avg_clone_size = 0
output = {
    "Files Count": 0,
    "Chunks Count": 0,
    "Candidates Count": 0,
    "Clones Count": 0,
    "Iteration Average Processing Time": 0,
    "Total time of finding candidates": 0,
    "Average File Processing Time": 0,
    "Average Chunk Processing Time": 0,
    "Average Clone Expansion Time": 0,
    "Latest Message": "",
}

app = Flask(__name__)

def format_output():
    global output
    string = ""
    for line in output:
        string += f'{line}: {output[line]}\n'
    string += f'Elapsed time: {get_elapsed_time(global_start_time)}\n'
    string += '-------------------------------------------'
    return string

def split_data_points():
    global data_points_queue
    out_data= {
        "Files": [],
        "Chunks": [],
        "Candidates": [],
        "Clones": [],
        "Expansions": []
    }
    for item in list(data_points_queue.queue):
        print(item)
        out_data[item["type"]].append(item)
    return out_data

def write_data_to_csv(data, filename):
    with open(filename, "w", newline="") as csv_file:
        csv_writer = csv.DictWriter(csv_file, fieldnames=data[0].keys())
        csv_writer.writeheader()
        csv_writer.writerows(data)

def get_elapsed_time(start_time):
    current_time = time.time()
    elapsed_time_seconds = current_time - start_time

    hours, remainder = divmod(elapsed_time_seconds, 3600)
    minutes, remainder = divmod(remainder, 60)
    seconds, milliseconds = divmod(remainder, 1)

    time_str = f"{int(hours):02}:{int(minutes):02}:{int(seconds):02}:{int(milliseconds * 1000):03}"

    return time_str

def calculate_avg_expansion_time(indir):
    return sum(item["time"] for item in indir) / len(indir) if indir else 0

def determine_processed_type(f_diff, ch_diff, ca_diff, cl_diff, latest_message):
    global print_count
    if f_diff > 0:
        return "Files"
    elif ch_diff > 0:
        return "Chunks"
    elif ca_diff > 0 or latest_message == "Identifying Clone Candidates...":
        return "Candidates"
    elif latest_message == "Expanding Candidates...":
        return "Expansions"
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

def calculate_statistics(processing_times):
    if processing_times:
        counts, times = zip(*processing_times)
        mean_time = sum(times) / len(times)
        return mean_time
    return 0

def calculate_average_clone_size(clones):
    total_size = 0
    total_count = 0

    for clone in clones:
        if 'instances' in clone:
            instances = clone['instances']
            if instances:
                total_size += instances[-1]['endLine'] - instances[0]['startLine']
                total_count += 1

    return total_size / total_count if total_count > 0 else 0
    
def calculate_average_chunks(chunks_list):
    file_count = {}
    total_chunks = 0

    for chunk in chunks_list:
        file_name = chunk['fileName']
        if file_name not in file_count:
            file_count[file_name] = 0
        file_count[file_name] += 1
        total_chunks += 1

    num_unique_files = len(file_count)

    return total_chunks / num_unique_files if num_unique_files > 0 else 0


def monitor():
    global output
    global data_points_queue
    global sleep_time
    global global_start_time
    global global_stop_time
    global avg_chunk_per_file
    global avg_clone_size

    stop_monitoring = False
    print_count = 0
    processing_times = {
        "Files": [],
        "Chunks": [],
        "Expansions": []
    }
    avg_processing_times = {
        "Files": 0,
        "Chunks": 0,
        "Expansions": 0
    }
    
    last_clone_id = 0

    f_count, ch_count, ca_count = 0, 0, 0
    cl_count, candidate_time_sum = 0, 0
    avg_processing_time = 0

    latest_message = ""
    
    while not stop_monitoring:
        time.sleep(sleep_time)
        try:
            start_time = time.time()

            t_f_count = db["files"].count_documents({})
            t_ch_count = db["chunks"].count_documents({})
            t_ca_count = db["candidates"].count_documents({})
            t_cl_count = db["clones"].count_documents({})
            diff = determine_processed_type(t_f_count - f_count, 
                                            t_ch_count - ch_count, 
                                            t_ca_count - ca_count, 
                                            t_cl_count - cl_count,
                                            latest_message)
             
            f_count = t_f_count
            ch_count = t_ch_count
            ca_count = t_ca_count if t_ca_count > ca_count else ca_count
            cl_count = t_cl_count
            type_count_map = {
                "Files": f_count,
                "Chunks": ch_count,
                "Candidates": ca_count,
                "Expansions": last_clone_id,
                "Clones": cl_count
            }

            if f_count > 0 and (diff is not None): 
                end_time = time.time()
                elapsed_time = end_time - start_time
                avg_processing_time = elapsed_time / type_count_map[diff] if type_count_map[diff] > 0 else 0     
                cur = db["statusUpdates"].find().sort([("_id", pymongo.DESCENDING)]).limit(1)
                for update in cur:
                    latest_message = update["message"]
                if diff != "Expansions" and diff != "Candidates":
                    processing_times[diff].append((type_count_map[diff], elapsed_time))
                elif diff == "Candidates":
                    candidate_time_sum += elapsed_time
                    continue
                elif diff == "Expansions":
                    expansion_times = list(db["expansion_times"].find({}))
                    processing_times["Expansions"] = [{"count": t["clone_id"], "time": t["expansion_time"] / 1000} for t in expansion_times]
                    if processing_times["Expansions"]:
                        avg_processing_times["Expansions"] = sum(item["time"] for item in processing_times["Expansions"]) / len(processing_times["Expansions"])
                        data_points_queue.put({
                            "type": diff,
                            "count": processing_times["Expansions"][-1]["count"],
                            "time": avg_processing_times["Expansions"]
                        })
                    else:
                        avg_processing_times["Expansions"] = 0
                        
                output = {
                    "Files Count": f_count,
                    "Chunks Count": ch_count,
                    "Candidates Count": ca_count,
                    "Clones Count": cl_count,
                    "Iteration Average Processing Time": avg_processing_time,
                    "Total time of finding candidates": candidate_time_sum,
                    "Average File Processing Time": avg_processing_times["Files"],
                    "Average Chunk Processing Time": avg_processing_times["Chunks"],
                    "Average Clone Expansion Time": avg_processing_times["Expansions"],
                    "Latest Message": latest_message,
                }
                if diff != "Candidates" and diff != "Expansions":
                    avg_processing_times[diff] = calculate_statistics(processing_times[diff])
                    data_points_queue.put({
                        "type": diff,
                        "count": type_count_map[diff],
                        "time": avg_processing_time
                    })
                
                print_frequency = 10 # Print frequency is in "print_count minutes"
                if (print_count != 0) and (print_count % (print_frequency * 60) == 0):
                    print(format_output())
                
                if latest_message == "Summary":
                    # Find out for how long it took for the program to finish
                    e_time = time.time()
                    g_elapsed_time_seconds = e_time - global_start_time
                    hours, remainder = divmod(g_elapsed_time_seconds, 3600)
                    minutes, remainder = divmod(remainder, 60)
                    seconds, milliseconds = divmod(remainder, 1)
                    global_stop_time = f"{int(hours):02}:{int(minutes):02}:{int(seconds):02}:{int(milliseconds * 1000):03}"
                    avg_processing_times["Candidates"] = candidate_time_sum/ca_count

                    print(f'Summarizing Qualitas Corpus processing.')

                    # Find some other interesting facts:
                    clones = list(db["clones"].find({}))
                    chunks = list(db["chunks"].find({}))

                    avg_clone_size = calculate_average_clone_size(clones)
                    avg_chunk_per_file = calculate_average_chunks(chunks)
                    
                    final_state = f'''
                            Completed after:                   {global_stop_time}
                            Files Count:                       {f_count}
                            Chunks Count:                      {ch_count}
                            Candidates Count:                  {ca_count}
                            Clones Count:                      {cl_count}
                            Iteration Average Processing Time: {avg_processing_time}s
                            Average File Processing Time:      {avg_processing_times["Files"]}s
                            Average Chunk Processing Time:     {avg_processing_times["Chunks"]}s
                            Average Clone Expansion Time:      {avg_processing_times["Expansions"]}s
                            Average Clone Size:                {avg_clone_size} lines
                            Average number of chunks per file: {avg_chunk_per_file} chunks
                            '''
                    print(final_state)
                    #if SAVE_TO_FILE and not stop_monitoring:
                    #    with open("data/final_state.txt", "w") as final_state_file:
                    #        final_state_file.write(final_state)
                        
                        #split_data = split_data_points()
                        #for key in out_data.keys():
                        #    write_data_to_csv(split_data[key], f'data/{key.lower()}.csv')
                    stop_monitoring = True # It'll continue the monitoring forever, but it will stop processing the data
                    time.sleep(60) # In case the program decides to exit afterwards, 
                                   # this will give you a chance to load in the last 
                                   # state of the page.
            print_count += sleep_time
        except Exception as e:
            print("Error in monitor function at line", sys.exc_info()[2].tb_lineno, ":", str(e))


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
        g_stop_time=global_stop_time,
        avg_chunk_per_file=avg_chunk_per_file,
        avg_clone_size=avg_clone_size
    )

if __name__ == "__main__":
    global_start_time = time.time()
    app.run(debug=True, host='0.0.0.0', port=5000)
