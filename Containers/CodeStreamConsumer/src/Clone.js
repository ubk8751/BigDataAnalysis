class Clone {
  constructor(sourceChunk, targetChunk, sourceName, targetName) {
    this.sourceName = sourceName;
    this.sourceStart = sourceChunk[0].lineNumber;
    this.sourceEnd = sourceChunk[sourceChunk.length - 1].lineNumber;
    this.sourceChunk = sourceChunk;

    this.targets = [];

    // Check if targetChunk is defined
    this.targets.push({
      name: targetName,
      startLine: targetChunk[0].lineNumber,
    });
  }

  equals(clone) {
    return (
      this.sourceName == clone.sourceName &&
      this.sourceStart == clone.sourceStart &&
      this.sourceEnd == clone.sourceEnd
    );
  }

  addTarget(target) {
    if (target) {
      this.targets.push({ name: target.name, startLine: target.startLine });
    } else {
      console.log("ERROR: No taget: " + target);
    }
  }

  isNext(clone) {
    return (
      this.sourceChunk[this.sourceChunk.length - 1].lineNumber ==
      clone.sourceChunk[clone.sourceChunk.length - 2].lineNumber
    );
  }

  maybeExpandWith(clone) {
    if (this.isNext(clone)) {
      this.sourceChunk = [
        ...new Set([...this.sourceChunk, ...clone.sourceChunk]),
      ];
      this.sourceEnd = this.sourceChunk[this.sourceChunk.length - 1].lineNumber;
      //console.log('Expanded clone, now starting at', this.sourceStart, 'and ending at', this.sourceEnd);
      return true;
    } else {
      return false;
    }
  }
}

module.exports = Clone;
