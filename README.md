# Fork information:

Original code copied from: [ https://github.com/mickesv/BigDataAnalytics]( https://github.com/mickesv/BigDataAnalytics). Edits made to code relevant to assignment.

## Assignment 3 Dicussion

## Assignment 3 Article summaries
### Article 1
Article 1 is *Software performance antipatterns* by Smith and Williams (2000). The authors discuss the concept of software design patterns and antipatterns, focusing on their impact on performance. They describe the difference between design patterns and antipatterns; established solutions to common software design problems vs. recurring design mistakes that lead to negative consequences.

The article introduces four performance-related antipatterns:
- **The God Class**
- **Excessive Dynamic Allocation**
- **Circuitous Treasure Hunt**
- **One Lane Bridge**

The article emphasizes the importance of considering performance consequences when using design patterns and antipatterns. It suggests that performance-related antipatterns help developers recognize and avoid common performance pitfalls, enhancing software architecture and design.

#### Measurements
The main measurements discussed in the article are related to the performance impact of the various software design antipatterns they discuss, evaluating the negative consequences of these antipatterns on software performance. The main measurements are:
- **Message Traffic**: The article discusses how the "God Class" antipattern can lead to excessive message traffic between classes, negatively affecting performance. It emphasizes the increase in the number of messages required to perform operations and its impact.
- **Dynamic Allocation Overhead**: In the "Excessive Dynamic Allocation" antipattern, the article measures the overhead caused by frequent creation and destruction of objects. It highlights the performance impact of dynamic allocation, especially in scenarios with high object turnover.
- **Database Access Patterns**: For the "Circuitous Treasure Hunt" antipattern, the article discusses the performance consequences of database access patterns. It measures the inefficiency of retrieving data in a way that requires a large number of database calls, particularly in distributed systems.
- **Service Time**: The article quantifies the impact of reducing service time, particularly in the context of the "One Lane Bridge" antipattern. It discusses how minimizing the time required for specific operations can improve overall responsiveness.

#### Main findings
The main findings of the article are that design patterns and antipatterns are valuable tools in software development for capturing expert knowledge and best practices, as well as identifying common design mistakes and their solutions. The authors highlight the need for both design patterns and antipatterns that explicitly address performance issues, as well as the importance of building performance intuition among software developers.

Overall, the article underscores the significance of integrating performance considerations into the design and development process, alongside the use of design patterns and antipatterns, to create more efficient and responsive software systems.

### Article 2
Article 2 is *New software performance antipatterns: More ways to shoot yourself in the foot* by Smith and Williams (2002). The article is a continuation of Article 1 and introduces four new performance antipatterns:
- **Unbalanced Processing**
- **Unnecessary Processing**
- **The Ramp**
- **More is Less**

The article emphasizes the importance of identifying these antipatterns early in the software development process, using models or measurements to assess their impact, and providing solutions that adhere to performance principles. Performance antipatterns help build developers' performance intuition and complement traditional design and architectural patterns.

#### Measurements
Article 2 does not contain specific measurements or quantitative data. Instead, it provides a conceptual understanding of the antipatterns and emphasizes the importance of identifying and addressing them in software development.

#### Main findings
Like Article 1, the article emphasizes the importance of identifying antipatterns early in the software development process to avoid scalability and performance problems. It also highlights the role of models and measurements in identifying and mitigating these issues.

### Article 3
Article 3 is *More new software performance antipatterns: Even more ways to shoot yourself in the foot* by Smith and Williams (2003). The article aims to expand the documentation of software antipatterns that started in Article 1 and continued in Article 2. The article introduces three additional antipatterns:
- **Falling Dominoes**
- **Tower of Babel**
- **Empty Semi Trucks**

#### Measurements
Like Article 2, Article 3 does not contain any quantitative measurements.

#### Main findings
Like Articles 1 and 2, Article 3 emphasizes the importance of identifying antipatterns early in the software development process to avoid scalability and performance problems. It also highlights the role of models and measurements in identifying and mitigating these issues. At the end, the authors list the currently documented antipatterns (14 in total).

### What can you learn?
Since my answer to all three "What can you learn?" questions will be marginally different, I'll just summarize it in one.

Due to me having done the Software Architecture course I already knew some of what was discussed in the articles. However, it was interesting to see quantitative data on the effects of some of the antipatterns, and I had not heard of a few of them, or at least not the names used, such as the *Circuitous Treasure Hunt* or *Empty Semi Trucks* patterns.

## Assignment 2 Questions:
#### Are you able to process the entire Qualitas Corpus? If not, what are the main issues (think in terms of data processing and storage) that causes the CodeStreamConsumer to hang? How can you modify the application to avoid these issues?

It would be difficult to process the entirety of the Qualitas Corpus, at least on my home PC. In fact, the program seems to stop processing around 23900 files read, likely due to the sheer size of the data needing to be processed more or less at the same time towards the end. I would say it's *theoretically* possible to do it, however not with the average PC's capabilities...

The way that the `CloneDetector` seems to be doing it right now is to compare line-to-line (or, to be more exact, chunk-by-chunk) in two files. This method brings upon it three main issue points:

1. **Performance Issues**: CloneDetector, or more specifically the CodeStreamConsumer component, suffers from performance problems. It hangs during processing, even when dealing with relatively small datasets. This issue can significantly impact its usability for handling actual Big Data workloads.
2. **Memory Consumption**: CodeStreamConsumer uses a `FileStorage` class, which keeps all processed files in memory. Additionally, it maintains a "chunkified" version of each file in memory as well. This approach effectively doubles the memory footprint for each file, which can lead to high memory usage and potential memory-related problems.
3. **Suboptimal Resource Utilization**: In many cases, the original file is not needed once the initial processing is completed.

The main points of utilization I can see are related to the latter two. These can be improved in various ways, including:

- **Hashing**: Instead of comparing SourceLines directly, calculate hash values (e.g., checksums or cryptographic hashes) for each SourceLine. Then, compare the hash values first, and only if they match, perform a detailed line-by-line comparison. Hashing can significantly reduce the number of full text comparisons.
- **Tokenization**: In a way similar to hashing, one can tokenize the SourceLines into smaller units, such as words or symbols, using a lexer or tokenizer. Then, compare the tokenized representations of the lines. Tokenization can help identify partial similarities without comparing entire lines.
- **Caching**: One can implement caching mechanisms to store previously compared chunks or lines. If the same chunks appear in different files, reuse the comparison results to avoid redundant work. To more efficiently one can implement an algorithm that sorts out the most commonly found clone elements, although it might not be too applicable to this program since it might be that every clone is unique.

#### Comparing two chunks implies \code{CHUNKSIZE} comparisons of individual \code{SourceLines}. What can be done to reduce the number of comparisons?

A way I can consider is to implement hashing of the `SourceLines` to make them easier to compare and store, and then implement a has table with the strucutre `<hash, file>`. You need then only to look what hashes has more than one file source and investigate those.

#### Studying the time it takes to process each file, do you see any trends as the number of already processed files grow? What may be the reasons for these trends (think in terms of the data processing algorithms)?

Other than what has already been mentioned in earlier questions, one can observe the graph over the average total procerssing time/number of files, as presented in the graph:

![Plot for average match time over number of files](./img/graph.png)

One can see that the more files processed, the longer the average time becomes, This is natural considering the bubblesort-like way the algorithm is tackling the problem. Since every file is compared to every file before it, it will mean that for every file you have checked, there is another file to a check, for every ten, there are ten more. The increase is (almost) linear, if you ignore the outliers, that are likely due to the algorithm, having to look through more/less files before finding anything. There are also no early stop conditions for the algorithm as we want to look through all the code files to find any clones. This is another aspect that makes it like bubble sort. 



# Big Data Analytics
Work material for parts of a course "Applied Computing and Big Data" offered by Blekinge Institute of Technology.

We are using the [Qualitas Corpus](http://qualitascorpus.com/) as a starting point for some fun very-nearly-big-data analysis.

Documentation and step-by-step instructions for this part of the course is found in the [Documentation](Documentation) directory.

## About the Course
The course Applied Cloud Computing and Big Data is a 7.5 ECTS course offered by Blekinge Institute of Technology. The course is organised around three themes, and all three themes must be completed to complete the course:

- Cloud Provisioning and Deployment
- The Business Case for Cloud Computing
- Big Data Analytics

The course is divided across two source code repositories:

- https://github.com/mickesv/ProvisioningDeployment.git contains the instructions and source code for the Cloud Provisioning and Deployment, and the Business Case for Cloud Computing parts of the course.
- https://github.com/mickesv/BigDataAnalytics.git contains the instructions and source code for the Big Data Analytics part of the course.

## Apply
If you wish to apply for the course, please visit [UniversityAdmissions](https://www.universityadmissions.se/intl/start) and search for "Applied Cloud Computing and Big Data".
