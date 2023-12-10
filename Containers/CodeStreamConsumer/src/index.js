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
    fs.readFile(files.data.filepath, { encoding: "utf8" }).then((data) => {
      return processFile(fields.name, data);
    });
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
  output = "<p>Timers for last file processed:</p>\n<ul>\n";
  let timers = Timer.getTimers(lastFile);
  for (t in timers) {
    output += "<li>" + t + ": " + timers[t] / 1000n + " µs\n";
  }
  output += "</ul>\n";
  return output;
}

function viewStats(req, res, next) {
  let page =
    "<HTML><HEAD><TITLE>CodeStream Clone Detector Statistics</TITLE></HEAD>\n";
  page += "<BODY><H1>CodeStream Clone Detector Statistics</H1>\n";

  let totalMatchTime = fileTimers.reduce(
    (sum, fileTimer) => {
      sum.total += fileTimer.timers.total;
      sum.match += fileTimer.timers.match;
      return sum;
    },
    { total: 0n, match: 0n }
  );

  let avgTimePerFile = fileTimers.length > 0 ? totalMatchTime.total / BigInt(fileTimers.length) : 0n;
  let avgTimePerMatch = fileTimers.length > 0 ? totalMatchTime.match / BigInt(fileTimers.length) : 0n;

  page += "<table border='1'><tr><th>Statistic</th><th>Value</th></tr>\n";
  page += `<tr><td>Total Files Processed</td><td>${fileTimers.length}</td></tr>\n`;
  page += `<tr><td>Average Total Time Per File (µs)</td><td>${avgTimePerFile / 1000n}</td></tr>\n`;
  page += `<tr><td>Average Match Time Per File (µs)</td><td>${avgTimePerMatch / 1000n}</td></tr>\n`;
  page += "</table>\n";

  // Generate the ASCII art distribution graph
  page += "<h2>Distribution of Total Times</h2>\n";
  page += generateDistributionGraph(fileTimers, "total");

  page += "<h2>Distribution of Match Times</h2>\n";
  page += generateDistributionGraph(fileTimers, "match");

  page += "</BODY></HTML>";
  res.send(page);
}

function generateDistributionGraph(data, property) {
  const numBins = 10; // Set the number of main bins as a constant
  const subBins = 10; // Set the number of sub-bins within the first bin
  const maxBarLength = 40;
  const times = data.map((fileTimer) => Number(fileTimer.timers[property]) / 1000000); // Convert to seconds

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

  let maxBarLengthWidth = maxBarLength;
  let maxRangeWidth = 0;
  let maxCountWidth = 0;

  for (let i = 0; i < bins.length; i++) {
    const binFrequency = bins[i];
    const binMinValue = i === 0 ? 0 : (i * binSize).toFixed(2);
    const binMaxValue = i === numBins - 1 ? maxTime.toFixed(2) : ((i + 1) * binSize).toFixed(2);
    const barLength = Math.ceil((binFrequency / times.length) * maxBarLength);

    const rangeAndCount = `[${binMinValue} - ${binMaxValue} s]`;
    maxRangeWidth = Math.max(maxRangeWidth, rangeAndCount.length);
    maxCountWidth = Math.max(maxCountWidth, binFrequency.toString().length);
  }

  let graph = "";

  for (let i = 0; i < bins.length; i++) {
    const binFrequency = bins[i];
    const binMinValue = i === 0 ? 0 : (i * binSize).toFixed(2);
    const binMaxValue = i === numBins - 1 ? maxTime.toFixed(2) : ((i + 1) * binSize).toFixed(2);
    const barLength = Math.ceil((binFrequency / times.length) * maxBarLength);

    const binMinValueStr = binMinValue.toString().padEnd(maxRangeWidth - 3);
    const binMaxValueStr = binMaxValue.toString().padStart(maxRangeWidth - 3);
    const rangeAndCount = `[${binMinValueStr} - ${binMaxValueStr} s]`;
    const count = binFrequency.toString().padEnd(maxCountWidth);
    const bars = `[${"=".repeat(barLength).padEnd(maxBarLengthWidth)}]`;

    graph += `| ${bars} | ${rangeAndCount} | ${count} |\n`;
  }
  const subBinSize = binSize / subBins;
  let subBinsHTML = "<h2>Sub-Bins Within the First Bin</h2>\n";
  subBinsHTML += "<table border='1'><tr><th>Sub-Bin</th><th>Count</th></tr>\n";

  for (let i = 0; i < subBins; i++) {
    const subBinMinValue = (i * subBinSize).toFixed(2);
    const subBinMaxValue = ((i + 1) * subBinSize).toFixed(2);
    const subBinFrequency = times.filter((time) => time >= subBinMinValue && time < subBinMaxValue).length;
    subBinsHTML += `<tr><td>${subBinMinValue} - ${subBinMaxValue} s</td><td>${subBinFrequency}</td></tr>\n`;
  }

  subBinsHTML += "</table>\n";

  return `<pre>${graph}</pre>\n${subBinsHTML}`;
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

function printStatistics(file, cloneDetector, cloneStore) {
  if (cloneDetector.numberOfProcessedFiles % STATS_FREQ === 0) {
    console.log(
      "Processed",
      cloneDetector.numberOfProcessedFiles,
      "files and found",
      cloneStore.numberOfClones,
      "clones."
    );
    console.log("List of found clones available at", URL);

    if (cloneDetector.numberOfProcessedFiles % TIMERS_FREQ === 0) {
      let avgTimePerFile =
        fileTimers.reduce((sum, timer) => sum + Number(Object.values(timer.timers)[0]), 0) /
        fileTimers.length;
      let avgTimeLast100Files =
        fileTimers
          .slice(-100)
          .reduce((sum, timer) => sum + Number(Object.values(timer.timers)[0]), 0) /
        Math.min(fileTimers.length, 100);
      let avgTimeLast1000Files =
        fileTimers
          .slice(-1000)
          .reduce((sum, timer) => sum + Number(Object.values(timer.timers)[0]), 0) /
        Math.min(fileTimers.length, 1000);

      console.log("Average time per file:", avgTimePerFile, "µs");
      console.log("Average time per last 100 files:", avgTimeLast100Files, "µs");
      console.log("Average time per last 1000 files:", avgTimeLast1000Files, "µs");

      // Add more statistics as needed

      console.log("List of found clones available at", URL);
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
  let file = { name: filename, contents: contents };
  const fileTimer = { filename, timers: { total: 0n, match: 0n } }; // Initialize timers

  return Promise.resolve(file)
    .then((file) => {
      Timer.startTimer(fileTimer, "total");
      return cd.preprocess(file);
    })
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
      return file;
    })
    .then(PASS((file) => (lastFile = file)))
    .then(PASS((file) => printStatistics(file, cd, cloneStore)))
    .then((file) => {
      file;
    });
}