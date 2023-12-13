const express = require("express");
const formidable = require("formidable");
const fs = require("fs/promises");
const app = express();
const PORT = 3000;

const Timer = require("./Timer");
const CloneDetector = require("./CloneDetector");
const CloneStorage = require("./CloneStorage");
const FileStorage = require("./FileStorage");
const fileTimers = [];
const TIMERS_FREQ = 10;
const STATS_FREQ = 100;
const URL = process.env.URL || "http://localhost:8080/";
var lastFile = null;
var skippedFiles = 0;

/*
1. Preprocessing: Remove uninteresting code, determine source and comparison units/granularities
2. Transformation: One or more extraction and/or transformation techniques are applied to the preprocessed code to obtain an intermediate representation of the code.
3. Match Detection: Transformed units (and/or metrics for those units) are compared to find similar source units.
4. Formatting: Locations of identified clones in the transformed units are mapped to the original code base by file location and line number.
5. Post-Processing and Filtering: Visualisation of clones and manual analysis to filter out false positives
6. Aggregation: Clone pairs are aggregated to form clone classes or families, in order to reduce the amount of data and facilitate analysis.
*/

// Express and Formidable stuff to receice a file for further processing
// --------------------
const form = formidable({ multiples: false });

app.post("/", fileReceiver);
function fileReceiver(req, res, next) {
  form.parse(req, (err, fields, files) => {
    if (files.data.filepath) {
      // adding this to make it stop crashing...
      fs.readFile(files.data.filepath, { encoding: "utf8" }).then((data) => {
        return processFile(fields.name, data);
      });
    } else {
      skippedFiles++;
      console.log(`${skippedFiles} files skipped\n`);
    }
  });
  return res.end("");
}

function viewTimers(req, res, next) {
  let page =
    "<HTML><HEAD><TITLE>CodeStream Clone Detector Timers</TITLE></HEAD>\n";
  page += "<BODY><H1>CodeStream Clone Detector Timers</H1>\n";
  fileTimers.forEach((fileTimer, index) => {
    page += `<h2>File ${index + 1}: ${fileTimer.filename}</h2>\n`;
    for (let timer in fileTimer.timers) {
      page += `<p>${timer}: ${fileTimer.timers[timer] / 1000n} µs</p>\n`;
    }
  });

  page += "</BODY></HTML>";
  res.send(page);
}

app.get("/", viewClones);
app.get("/timers", viewTimers);
app.get("/stats", viewStats);

const server = app.listen(PORT, () => {
  console.log("Listening for files on port", PORT);
});

// Page generation for viewing current progress
// --------------------
function getStatistics() {
  let cloneStore = CloneStorage.getInstance();
  let fileStore = FileStorage.getInstance();
  let output =
    "Processed " +
    fileStore.numberOfFiles +
    " files containing " +
    cloneStore.numberOfClones +
    " clones.";
  return output;
}

function lastFileTimersHTML() {
  if (!lastFile) return "";
  let output = "<p>Timers for last file processed:</p>\n";
  const timers = Timer.getTimers(lastFile.name, fileTimers);
  if (timers.length === 0) {
    output += "<p>No timers found for the last file.</p>\n";
  } else {
    output += "<ul>\n";
    output += "<li>Filename: " + lastFile.name + "</li>\n";

    for (const timerType in timers[0].timers) {
      const timerValue = timers[0].timers[timerType];
      output += "<li>" + timerType + ": " + timerValue + " µs</li>\n";
    }

    output += "</ul>\n";
  }

  return output;
}

function viewStats(req, res, next) {
  const normalize = process.env.NORMALIZE === "true"; // Check the NORMALIZE flag
  let page =
    "<HTML><HEAD><TITLE>CodeStream Clone Detector Statistics</TITLE></HEAD>\n";
  page += "<BODY><H1>CodeStream Clone Detector Statistics</H1>\n";

  if (normalize) {
    page +=
      "<p>Normalize flag is activated. All times are now per line of code.</p>";
  }

  let totalMatchTime = fileTimers.reduce(
    (sum, fileTimer) => {
      sum.total += fileTimer.timers.total;
      sum.match += fileTimer.timers.match;
      return sum;
    },
    { total: 0n, match: 0n },
  );

  let avgTimePerFile =
    fileTimers.length > 0
      ? totalMatchTime.total / BigInt(fileTimers.length)
      : 0n;
  let avgTimePerMatch =
    fileTimers.length > 0
      ? totalMatchTime.match / BigInt(fileTimers.length)
      : 0n;

  page += "<table border='1'><tr><th>Statistic</th><th>Value</th></tr>\n";
  page += `<tr><td>Total Files Processed</td><td>${fileTimers.length}</td></tr>\n`;

  page += `<tr><td>Average Total Time Per ${
    normalize ? "line" : "file"
  } (µs)</td><td>${avgTimePerFile}</td></tr>\n`;
  page += `<tr><td>Average Match Time Per ${
    normalize ? "line" : "file"
  } (µs)</td><td>${avgTimePerMatch}</td></tr>\n`;

  page += "</table>\n";

  // Generate the ASCII art distribution graph
  page += "<h2>Distribution of Total Times</h2>\n";
  page += generateDistributionGraph(fileTimers, "total");

  page += "<h2>Distribution of Match Times</h2>\n";
  page += generateDistributionGraph(fileTimers, "match");

  page += "<h2>Graph: Average Total Time vs. Number of Files Processed</h2>\n";
  page +=
    '<canvas id="lineGraph" style="width: 800px; height: 400px;"></canvas>\n';
  page += '<script src="https://cdn.jsdelivr.net/npm/chart.js"></script>\n';
  page += "<script>\n";
  page += 'var ctx = document.getElementById("lineGraph").getContext("2d");\n';
  page += "var data = {\n";
  page += "  labels: [" + fileTimers.map((_, index) => index + 1) + "],\n";
  page += "  datasets: [{\n";
  page += '    label: "Average Total Time (ms)",\n';
  page += '    borderColor: "rgba(75, 192, 192, 1)",\n'; // Line color
  page += "    borderWidth: 2,\n";
  page += "    pointRadius: 0,\n";
  page +=
    "    data: [" +
    fileTimers.map((timer) => Number(timer.timers.total) / 1000) +
    "],\n";
  page += '    pointStyle: "line",\n';
  page += '    pointBackgroundColor: "rgba(0, 0, 0, 0)",\n';
  page += "  }]\n";
  page += "};\n";
  page += "var myLineChart = new Chart(ctx, {\n";
  page += '  type: "line",\n';
  page += "  data: data,\n";
  page += "  options: {\n";
  page +=
    "    responsive: false, // Disable responsiveness to fix chart size\n";
  page += "    scales: {\n";
  page += "      x: {\n";
  page += '        type: "linear",\n';
  page += '        position: "bottom",\n';
  page += "        title: {\n";
  page += "          display: true,\n";
  page += '          text: "Number of Files Processed"\n';
  page += "        }\n";
  page += "      },\n";
  page += "      y: {\n";
  page += "        beginAtZero: true,\n";
  page += "        title: {\n";
  page += "          display: true,\n";
  page += `          text: "${
    normalize ? "Normalized a" : "A"
  }verage Total Time (ms)"\n`;
  page += "        }\n";
  page += "      }\n";
  page += "    },\n";
  page += "    plugins: {\n";
  page += "      legend: {\n";
  page += "        display: false // Hide legend\n";
  page += "      }\n";
  page += "    },\n";
  page += "    elements: {\n";
  page += "      line: {\n";
  page += "        tension: 0, // Disable bezier curves\n";
  page += "      }\n";
  page += "    }\n";
  page += "  }\n";
  page += "});\n";
  page += "</script>\n";

  page += "</BODY></HTML>";
  res.send(page);
}

function generateDistributionGraph(data, property) {
  const numBins = 10;
  const subBins = 10;
  const maxBarLength = 40;
  const times = data.map(
    (fileTimer) => Number(fileTimer.timers[property]) / 1000000,
  ); // Convert to seconds

  let maxTime = 0;
  for (const time of times) {
    if (time > maxTime) {
      maxTime = time;
    }
  }

  const binSize = maxTime / numBins;
  const bins = Array(numBins).fill(0);

  for (const time of times) {
    const binIndex = Math.floor(time / binSize);
    if (binIndex === numBins) {
      bins[numBins - 1] += 1;
    } else {
      bins[binIndex] += 1;
    }
  }

  const binMinValues = [];
  const binMaxValues = [];

  for (let i = 0; i < bins.length; i++) {
    const binMinValue = (i * binSize).toFixed(2);
    const binMaxValue = ((i + 1) * binSize).toFixed(2);
    binMinValues.push(binMinValue);
    binMaxValues.push(binMaxValue);
  }

  let graphHTML =
    '<div style="display: flex; flex-direction: row; align-items: flex-end;">';

  for (let i = 0; i < bins.length; i++) {
    const binFrequency = bins[i];
    const binMinValue = binMinValues[i];
    const binMaxValue = binMaxValues[i];
    const barLength = Math.ceil((binFrequency / times.length) * maxBarLength);

    graphHTML += `
      <div style="margin: 5px; display: flex; flex-direction: column; align-items: center;">
        <div style="background-color: #007BFF; width: 20px; height: ${barLength}px;"></div>
        <div style="text-align: center;">[${binMinValue} - ${binMaxValue} s]</div>
        <div style="text-align: center;">${binFrequency}</div> <!-- Display count above the bar -->
      </div>
    `;
  }

  graphHTML += "</div>";
  const subBinSize = binSize / subBins;
  let subBinsHTML =
    '<div style="display: flex; flex-direction: row; align-items: flex-end;">';

  for (let i = 0; i < subBins; i++) {
    const subBinMinValue = (i * subBinSize).toFixed(2);
    const subBinMaxValue = ((i + 1) * subBinSize).toFixed(2);
    const subBinFrequency = times.filter(
      (time) => time >= subBinMinValue && time < subBinMaxValue,
    ).length;
    const subBarLength = Math.ceil(
      (subBinFrequency / times.length) * maxBarLength,
    );

    subBinsHTML += `
      <div style="margin: 5px; display: flex; flex-direction: column; align-items: center;">
        <div style="background-color: #FF5733; width: 20px; height: ${subBarLength}px;"></div>
        <div style="text-align: center;">[${subBinMinValue} - ${subBinMaxValue} s]</div>
        <div style="text-align: center;">${subBinFrequency}</div> <!-- Display count above the bar -->
      </div>
    `;
  }

  subBinsHTML += "</div>";

  return `<h2>Main Bins</h2>${graphHTML}<h2>Sub-Bins Within the First Bin</h2>${subBinsHTML}`;
}

function listClonesHTML() {
  let cloneStore = CloneStorage.getInstance();
  let output = "";

  // Reverse the order of clones to have the latest at the top
  let reversedClones = cloneStore.clones.slice().reverse();

  reversedClones.forEach((clone) => {
    output += "<hr>\n";
    if (Array.isArray(clone.sourceChunk) && clone.sourceChunk.length > 0) {
      const firstSourceLine = clone.sourceChunk[0].myLineNumber;
      const lastSourceLine =
        clone.sourceChunk[clone.sourceChunk.length - 1].myLineNumber;
      output += "<h2>Source File: " + clone.sourceName + "</h2>\n";
      output +=
        "<p>Starting at line: " +
        firstSourceLine +
        " , ending at line: " +
        lastSourceLine +
        "</p>\n";
      output += "<ul>";
      clone.targets.forEach((target) => {
        if (target.name && target.startLine) {
          output +=
            '<li>Found in "' +
            target.name +
            '" starting at line ' +
            target.startLine +
            "\n";
        } else {
          output +=
            "<li>Found in unknown location starting at line " +
            target.startLine +
            "\n";
        }
      });

      output += "</ul>\n";
      output += "<h3>Contents:</h3>\n<pre><code>\n";
      output += clone.originalCode;
      output += "</code></pre>\n";
    } else {
      console.error(
        "Error: sourceName is not an array or is empty in the clone object.",
      );
    }
  });

  return output;
}

function listProcessedFilesHTML() {
  let fs = FileStorage.getInstance();
  let output = "<HR>\n<H2>Processed Files</H2>\n";
  output += fs.filenames.reduce((out, name) => {
    out += "<li>" + name + "\n";
    return out;
  }, "<ul>\n");
  output += "</ul>\n";
  return output;
}

function viewClones(req, res, next) {
  let page = "<HTML><HEAD><TITLE>CodeStream Clone Detector</TITLE></HEAD>\n";
  page += "<BODY><H1>CodeStream Clone Detector</H1>\n";
  page += "<P>" + getStatistics() + "</P>\n";
  page += lastFileTimersHTML() + "\n";
  page += `Skipped files: ${skippedFiles}\n`;
  page += listClonesHTML() + "\n";
  page += listProcessedFilesHTML() + "\n";
  page += "</BODY></HTML>";
  res.send(page);
}

// Some helper functions
// --------------------
// PASS is used to insert functions in a Promise stream and pass on all input parameters untouched.
PASS = (fn) => (d) => {
  try {
    fn(d);
    return d;
  } catch (e) {
    throw e;
  }
};

function printStatistics(file, cloneDetector, cloneStore, normalize) {
  if (cloneDetector.numberOfProcessedFiles % STATS_FREQ === 0) {
    console.log(
      "Processed",
      cloneDetector.numberOfProcessedFiles,
      "files and found",
      cloneStore.numberOfClones,
      "clones.",
    );
    const normalize = process.env.NORMALIZE === "true"; // Check the NORMALIZE flag
    console.log("List of found clones available at", URL);
    if (cloneDetector.numberOfProcessedFiles % TIMERS_FREQ === 0) {
      let avgTimePerFile =
        fileTimers.reduce(
          (sum, timer) => sum + Number(Object.values(timer.timers)[0]),
          0,
        ) / fileTimers.length;
      let avgTimeLast100Files =
        fileTimers
          .slice(-100)
          .reduce(
            (sum, timer) => sum + Number(Object.values(timer.timers)[0]),
            0,
          ) / Math.min(fileTimers.length, 100);
      let avgTimeLast1000Files =
        fileTimers
          .slice(-1000)
          .reduce(
            (sum, timer) => sum + Number(Object.values(timer.timers)[0]),
            0,
          ) / Math.min(fileTimers.length, 1000);

      console.log(
        `${
          normalize ? "Normalized a" : "A"
        }verage time per file: ${avgTimePerFile} µs`,
      );
      console.log(
        `${
          normalize ? "Normalized a" : "A"
        }verage time per last 100 files:: ${avgTimeLast100Files} µs`,
      );
      console.log(
        `${
          normalize ? "Normalized a" : "A"
        }verage time per last 1000 files:: ${avgTimeLast1000Files} µs`,
      );

      console.log("List of found clones available at" + URL + "\n");
    }
  }

  return file;
}

// Processing of the file
// --------------------
// TODO Store the timers from every file (or every 10th file), create a new landing page /timers
// and display more in-depth statistics there. Examples include:
// average times per file, average times per last 100 files, last 1000 files.
// Perhaps throw in a graph over all files.
// .catch(console.log);
function processFile(filename, contents) {
  let cd = new CloneDetector();
  let cloneStore = CloneStorage.getInstance();
  const fileTimer = { filename, timers: { total: 0n, match: 0n } }; // Initialize timers
  const normalize = process.env.NORMALIZE === "true"; // Check the NORMALIZE flag

  // Start the total timer
  Timer.startTimer(fileTimer, "total");

  // Create the file object
  let file = { name: filename, contents: contents };

  return Promise.resolve(file)
    .then((file) => cd.preprocess(file))
    .then((file) => cd.transform(file))
    .then((file) => {
      Timer.startTimer(fileTimer, "match");
      return cd.matchDetect(file);
    })
    .then((file) => {
      file = cd.expandClones(file);
      return file;
    })
    .then((file) => cloneStore.storeClones(file))
    .then((file) => {
      Timer.endTimer(fileTimer, "match");
      return cd.storeFile(file);
    })
    .then((file) => {
      Timer.endTimer(fileTimer, "total");
      fileTimers.push(fileTimer);

      if (normalize) {
        const linesInFile = BigInt(contents.split("\n").length);
        fileTimer.timers.match =
          linesInFile > 0n ? fileTimer.timers.match / linesInFile : 0n;
        fileTimer.timers.total =
          linesInFile > 0n ? fileTimer.timers.total / linesInFile : 0n;
      }

      return file;
    })
    .then(
      PASS((file) => {
        lastFile = file;
        return file;
      }),
    )
    .then(PASS((file) => printStatistics(file, cd, cloneStore, normalize)))
    .then((file) => {
      return file;
    });
}
