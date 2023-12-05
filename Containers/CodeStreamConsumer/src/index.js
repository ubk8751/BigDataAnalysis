const express = require('express');
const formidable = require('formidable');
const fs = require('fs/promises');
const app = express();
const PORT = 3000;

const Timer = require('./Timer');
const CloneDetector = require('./CloneDetector');
const CloneStorage = require('./CloneStorage');
const FileStorage = require('./FileStorage');
const fileTimers = [];
const TIMERS_FREQ = 10;
const STATS_FREQ = 100;
const URL = process.env.URL || 'http://localhost:8080/';
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
const form = formidable({multiples:false});

app.post('/', fileReceiver );
function fileReceiver(req, res, next) {
    form.parse(req, (err, fields, files) => {
        fs.readFile(files.data.filepath, { encoding: 'utf8' })
            .then( data => { return processFile(fields.name, data); });
    });
    return res.end('');
}

function viewTimers(req, res, next) {
    let page = '<HTML><HEAD><TITLE>CodeStream Clone Detector Timers</TITLE></HEAD>\n';
    page += '<BODY><H1>CodeStream Clone Detector Timers</H1>\n';
    
    // Display timers and statistics
    fileTimers.forEach((fileTimer, index) => {
        page += `<h2>File ${index + 1}: ${fileTimer.filename}</h2>\n`;
        for (let timer in fileTimer.timers) {
            page += `<p>${timer}: ${fileTimer.timers[timer] / 1000n} µs</p>\n`;
        }
    });
    
    page += '</BODY></HTML>';
    res.send(page);
}

app.get('/', viewClones );
app.get('/timers', viewTimers);

const server = app.listen(PORT, () => { console.log('Listening for files on port', PORT); });


// Page generation for viewing current progress
// --------------------
function getStatistics() {
    let cloneStore = CloneStorage.getInstance();
    let fileStore = FileStorage.getInstance();
    let output = 'Processed ' + fileStore.numberOfFiles + ' files containing ' + cloneStore.numberOfClones + ' clones.'
    return output;
}

function lastFileTimersHTML() {
    if (!lastFile) return '';
    output = '<p>Timers for last file processed:</p>\n<ul>\n'
    let timers = Timer.getTimers(lastFile);
    for (t in timers) {
        output += '<li>' + t + ': ' + (timers[t] / (1000n)) + ' µs\n'
    }
    output += '</ul>\n';
    return output;
}

function listClonesHTML() {
    let cloneStore = CloneStorage.getInstance();
    let output = '';

    cloneStore.clones.forEach(clone => {
        output += '<hr>\n';
        if (Array.isArray(clone.sourceName) && clone.sourceName.length > 0) {
            const firstSourceLine = clone.sourceName[0].myLineNumber;
            const lastSourceLine = clone.sourceName[clone.sourceName.length - 1].myLineNumber;
            console.log(clone.sourceName[clone.sourceName.length - 1], lastSourceLine)
            output += '<h2>Source File: ' + clone.sourceChunk + '</h2>\n';
            output += '<p>Starting at line: ' + firstSourceLine + ' , ending at line: ' + lastSourceLine + '</p>\n';
            output += '<ul>';
            clone.targets.forEach(target => {
                if (target && Array.isArray(target.name) && target.name.length > 0) {
                    // Assuming the first target line is representative
                    const firstTargetLine = target.name[0];
                    if (firstTargetLine && firstTargetLine.myContent) {
                        output += '<li>Found in ' + firstTargetLine.myContent + ' starting at line ' + target.startLine + '\n';
                    } else {
                        output += '<li>Found in unknown location starting at line ' + target.startLine + '\n';
                    }
                } else {
                    output += '<li>Found in unknown location starting at line ' + target.startLine + '\n';
                }
            });
            
            output += '</ul>\n';
            output += '<h3>Contents:</h3>\n<pre><code>\n';
            output += clone.originalCode;
            output += '</code></pre>\n';
        } else {
            console.error('Error: sourceName is not an array or is empty in the clone object.');
        }
    });

    return output;
}


function listProcessedFilesHTML() {
    let fs = FileStorage.getInstance();
    let output = '<HR>\n<H2>Processed Files</H2>\n'
    output += fs.filenames.reduce( (out, name) => {
        out += '<li>' + name + '\n';
        return out;
    }, '<ul>\n');
    output += '</ul>\n';
    return output;
}

function viewClones(req, res, next) {
    let page='<HTML><HEAD><TITLE>CodeStream Clone Detector</TITLE></HEAD>\n';
    page += '<BODY><H1>CodeStream Clone Detector</H1>\n';
    page += '<P>' + getStatistics() + '</P>\n';
    page += lastFileTimersHTML() + '\n';
    page += listClonesHTML() + '\n';
    page += listProcessedFilesHTML() + '\n';
    page += '</BODY></HTML>';
    res.send(page);
}

// Some helper functions
// --------------------
// PASS is used to insert functions in a Promise stream and pass on all input parameters untouched.
PASS = fn => d => {
    try {
        fn(d);
        return d;
    } catch (e) {
        throw e;
    }
};


function printStatistics(file, cloneDetector, cloneStore) {
    if (cloneDetector.numberOfProcessedFiles % STATS_FREQ === 0) {
        console.log('Processed', cloneDetector.numberOfProcessedFiles, 'files and found', cloneStore.numberOfClones, 'clones.');
        console.log('List of found clones available at', URL);
        // Calculate and display more in-depth statistics on the /timers page
        /*if (cloneDetector.numberOfProcessedFiles % TIMERS_FREQ === 0) {
            let avgTimePerFile = fileTimers.reduce((sum, timer) => sum + Number(Object.values(timer.timers)[0]), 0) / fileTimers.length;
            let avgTimeLast100Files = fileTimers.slice(-100).reduce((sum, timer) => sum + Number(Object.values(timer.timers)[0]), 0) / Math.min(fileTimers.length, 100);
            let avgTimeLast1000Files = fileTimers.slice(-1000).reduce((sum, timer) => sum + Number(Object.values(timer.timers)[0]), 0) / Math.min(fileTimers.length, 1000);
        
            console.log('Average time per file:', avgTimePerFile, 'µs');
            console.log('Average time per last 100 files:', avgTimeLast100Files, 'µs');
            console.log('Average time per last 1000 files:', avgTimeLast1000Files, 'µs');
            // Add more statistics as needed
        
            console.log('List of found clones available at', URL);
        }*/
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

    return Promise.resolve(file)
        .then((file) => Timer.startTimer(file, 'total'))
        .then((file) => cd.preprocess(file))
        .then((file) => cd.transform(file))
        .then((file) => Timer.startTimer(file, 'match'))
        .then((file) => cd.matchDetect(file))
        .then((file) => cloneStore.storeClones(file))
        .then((file) => Timer.endTimer(file, 'match'))
        .then((file) => cd.storeFile(file))
        .then((file) => Timer.endTimer(file, 'total'))
        .then(PASS((file) => lastFile = file))
        .then(PASS((file) => printStatistics(file, cd, cloneStore)))
        .then((file) => { file }); // Return the file for further processing or logging
}

