"use strict";
const logger = require("./winston/logger");

// Import required dependencies
const { spawn, exec } = require("child_process");
const fs = require("fs");
const moment = require("moment");
const ffmpeg = require("fluent-ffmpeg");
const path = require("path");
const _ = require("lodash");

// Define VideoStreamProcessor class
class VideoStreamProcessor {
  // Define class properties
  threadQueue;
  videoSources;
  processingVideos;
  blobContainerClient;
  videoFilename;
  videoFolderPath;
  timezone;

  // Constructor
  constructor(blobContainerClient, timezone) {
    this.blobContainerClient = blobContainerClient;
    this.threadQueue = [];
    this.videoSources = [];
    this.processingVideos = new Set();
    this.timezone = timezone;
  }

  async getVideoDuration(filePath) {
    return new Promise((resolve, reject) => {
      ffmpeg.ffprobe(filePath, (err, metadata) => {
        if (err) {
          resolve(0);
        } else {
          resolve(Math.floor(metadata.format.duration));
        }
      });
    });
  }

  /**
   * Uploads video files from the specified folder to Azure Storage and deletes local files.
   * @param {string} videoFolderPath - The folder path where the video files are located.
   **/

  async uploadToBlobContainer(videoFolderPath) {
    const directorys = await fs.promises.readdir(videoFolderPath);

    for (const directory of directorys) {
      const files = await fs.promises.readdir(
        videoFolderPath + "/" + directory
      );

      // let total = files.length > 1 ? files.length - 1 : files.length;
      const mp4Files = files.filter((file) => file.endsWith(".mp4"));

      for (const file of mp4Files) {
        if (file) {
          const fileNameWithoutExtension = path.parse(file).name;
          const splitFileName = fileNameWithoutExtension.split("_");
          const tsFileName = `${splitFileName[0]}_${splitFileName[1]}_${splitFileName[2]}.ts`;
          const readTsFile = await fs.existsSync(
            videoFolderPath + "/" + directory + "/" + tsFileName
          );
          if (!readTsFile) {
            const blobName = `${directory}/${file}`;
            const blobClient = await this.blobContainerClient.getBlobClient(
              blobName
            );
            const blockBlobClient = await blobClient.getBlockBlobClient();
            const readStream = await fs.createReadStream(
              videoFolderPath + "/" + directory + "/" + file
            );
            const uploadOptions = {
              bufferSize: 4 * 1024 * 1024,
              maxBuffers: 20,
            };
            const uploadPromise = blockBlobClient.uploadStream(
              readStream,
              uploadOptions.bufferSize,
              uploadOptions.maxBuffers,
              {
                blobHTTPHeaders: {
                  blobContentType: "video/mp4", // video/MP2T
                },
                metadata: {
                  source: file,
                },
              }
            );
            readStream.on("end", async () => {
              logger.info(`uploaded ${file} to azure blob container`);
              try {
                await fs.unlinkSync(
                  videoFolderPath + "/" + directory + "/" + file
                );
              } catch (e) {
                logger.error(`remove ${file} failed!`);
              }
            });
            await uploadPromise;
          }
        }
      }
    }
    // await this.stop();
  }

  async start() {
    for (const rtspSource of this.videoSources) {
      if (this.processingVideos.has(rtspSource.name)) {
        logger.info(`${rtspSource.name} is already being processed`);
        // console.log(`${rtspSource.name} is already being processed`);
        continue;
      }

      // Create video folder
      const videoFolderPath = `./video/${rtspSource.name}`;
      logger.info(videoFolderPath);
      if (!fs.existsSync(videoFolderPath)) {
        fs.mkdirSync(videoFolderPath);
      }

      // Create video thread
      // mpeg-ts
      const process = spawn(
        "ffmpeg",
        [
          "-rtsp_transport",
          "tcp",
          "-i",
          rtspSource.url,
          "-reset_timestamps",
          "1",
          "-metadata",
          `title=${rtspSource.name}_${moment().format("YYYY-MM-DD_HH:mm:ss")}`,
          "-an",
          "-f",
          "segment",
          "-segment_time",
          "900",
          "-segment_format",
          "mpegts",
          "-strftime",
          "1",
          `${videoFolderPath}/${rtspSource.name}_%Y-%m-%d_%H-%M-%S.ts`,
        ],
        { detached: true, stdio: "ignore" }
      );

      process.channelName = rtspSource.name;

      process.unref();

      // Add video to processing list
      this.processingVideos.add(rtspSource.name);

      const now = moment.utc();
      const timeToMidnight = moment.utc().endOf("day").diff(now);

      // Set up a timer to exit the current process at midnight UTC
      setTimeout(() => {
        process.exit();
      }, timeToMidnight);

      // Add listener for process exit event
      process.on("exit", async (code, signal) => {
        logger.info(
          `Process ${process.channelName} has exited with code ${code} and signal ${signal}`
        );

        const files = await fs.promises.readdir(
          "./video/" + process.channelName
        );

        let tsFiles = files.filter((file) => file.endsWith(".ts"));
        const mp4Files = files.filter((file) => file.endsWith(".mp4"));

        const duplicateFiles = [];

        for (const tsFile of tsFiles) {
          const tsResult = tsFile.substring(0, tsFile.lastIndexOf("."));
          const matchingMp4Files = mp4Files.filter((mp4File) => {
            // const lastUnderscoreIndex = mp4File.lastIndexOf("_");
            // const secondLastUnderscoreIndex = mp4File.lastIndexOf(
            //   "_",
            //   lastUnderscoreIndex - 1
            // );
            // const mp4Result = mp4File.substring(0, secondLastUnderscoreIndex);
            const splitFileName = mp4File.split("_");
            const mp4Result = `${splitFileName[0]}_${splitFileName[1]}_${splitFileName[2]}`;
            return mp4Result === tsResult;
          });
          if (matchingMp4Files.length > 0) {
            duplicateFiles.push(tsFile);
          }
        }

        const nonDuplicateTsFiles = _.difference(tsFiles, duplicateFiles);
        const duplicateTsFiles = _.intersection(tsFiles, duplicateFiles);

        if (nonDuplicateTsFiles.length > 0) {
          for (const file of nonDuplicateTsFiles) {
            const fileNameWithoutExtension = path.parse(file).name;
            const inputName = `./video/${process.channelName}/${file}`;
            const videoDuration = await this.getVideoDuration(inputName);

            const inputDatetimeFilter = fileNameWithoutExtension.substring(
              fileNameWithoutExtension.indexOf("_") + 1
            );

            const endDateTime = moment(
              moment(inputDatetimeFilter, "YYYY-MM-DD_HH-mm-ss").format(
                "YYYY-MM-DD HH:mm:ss"
              )
            )
              .add(videoDuration, "seconds")
              .format("YYYY-MM-DD_HH-mm-ss");

            const outputName = `./video/${process.channelName}/${fileNameWithoutExtension}_${endDateTime}_${this.timezone}.mp4`;

            await ffmpeg(inputName)
              .outputOptions("-c:v", "libx264")
              .outputOptions("-movflags", "+faststart")
              .output(outputName)
              .on("end", async () => {
                logger.info("Conversion complete");
                // fs.unlinkSync(inputName);
                await fs.promises.unlink(inputName);
                logger.info(`${inputName} - deleted`);
              })
              .on("error", async (err) => {
                logger.info(`Conversion error: ${err.message}`);
                // fs.unlinkSync(inputName);
                await fs.promises.unlink(inputName);
                logger.info(`${inputName} - deleted`);
              })
              .run();
          }
        }

        if (duplicateTsFiles.length > 0) {
          for (const file of duplicateTsFiles) {
            const inputName = `./video/${process.channelName}/${file}`;
            logger.info(`duplicate file: ${inputName} - deleted`);
            await fs.promises.unlink(inputName);
          }
        }

        this.processingVideos.delete(process.channelName);

        const videoSources = this.getVideoSources();
        const filteredSources = videoSources.filter(
          (source) => source.name !== process.channelName
        );
        this.setVideoSources(filteredSources);
        await this.terminateProcessByName(process.channelName);
      });

      // Add thread to thread queue
      // { channelName: rtspSource.name }
      this.threadQueue.push(process);
    }
  }

  // async stopName(channel) {
  //   const thread = this.threadQueue.find(
  //     (thread) => thread.channelName === channel
  //   );
  //   if (thread) {
  //     thread.kill();
  //     try {
  //       if (process.platform === "win32") {
  //         // Windows-specific code goes here
  //         const terminateProcess = (pid) => {
  //           return new Promise((resolve, reject) => {
  //             exec(`taskkill /pid ${pid} /T /F`, (error, stdout, stderr) => {
  //               if (error) {
  //                 reject(error);
  //               } else {
  //                 resolve();
  //               }
  //             });
  //           });
  //         };
  //         terminateProcess(thread.pid);
  //       } else {
  //         // Non-Windows-specific code goes here
  //         process.kill(thread.pid, "SIGKILL");
  //       }
  //     } catch (e) {
  //       logger.error("The process not found or deleted");
  //     }
  //     await this.processingVideos.delete(channel);
  //     const videoSources = await this.getVideoSources();
  //     const filteredSources = videoSources.filter(
  //       (source) => source.name === channel
  //     );
  //     await this.setVideoSources(filteredSources);
  //   }
  // }

  async terminateProcessByName(channelName) {
    const threadIndex = this.threadQueue.findIndex(
      (data) => data.channelName === channelName
    );
    if (threadIndex !== -1) {
      const thread = this.threadQueue[threadIndex];
      logger.warn(`kill ${thread.pid}`);
      logger.warn(`kill ${thread.channelName}`);
      thread.kill();
      if (process.platform === "win32") {
        // Windows-specific code goes here
        const terminateProcess = (pid) => {
          return new Promise((resolve, reject) => {
            exec(`tasklist /fi "PID eq ${pid}"`, (error, stdout, stderr) => {
              if (error) {
                reject(error);
              } else {
                const isRunning =
                  stdout.toLowerCase().indexOf(`pid: ${pid}`) !== -1;
                if (isRunning) {
                  try {
                    exec(
                      `taskkill /pid ${pid} /T /F`,
                      (error, stdout, stderr) => {
                        if (error) {
                          reject(error);
                        } else {
                          resolve();
                        }
                      }
                    );
                  } catch (e) {
                    reject(error);
                  }
                } else {
                  resolve();
                }
              }
            });
          });
        };
        terminateProcess(thread.pid);
      } else {
        // Non-Windows-specific code goes here
        try {
          process.kill(thread.pid, 0);
        } catch (error) {
          if (error.code === "ESRCH") {
            logger.warn(`Process with PID ${thread.pid} does not exist.`);
            // Remove the thread from the threadQueue array
            this.threadQueue.splice(threadIndex, 1);
            return;
          }
        }

        process.kill(thread.pid, "SIGKILL");
        logger.warn(`Process with PID ${thread.pid} has been killed.`);
      }

      // Remove the thread from the threadQueue array
      this.threadQueue.splice(threadIndex, 1);
    } else {
      logger.warn(
        `Thread with channel name ${channelName} does not exist in the threadQueue.`
      );
    }
  }

  async stop() {
    for (const thread of this.threadQueue) {
      if (thread) {
        logger.warn(`kill ${thread.pid}`);
        logger.warn(`kill ${thread.channelName}`);
        thread.kill();
        if (process.platform === "win32") {
          // Windows-specific code goes here
          const terminateProcess = (pid) => {
            return new Promise((resolve, reject) => {
              exec(`taskkill /pid ${pid} /T /F`, (error, stdout, stderr) => {
                if (error) {
                  reject(error);
                } else {
                  resolve();
                }
              });
            });
          };
          try {
            await terminateProcess(thread.pid);
          } catch (e) {
            logger.error(e);
          }
        } else {
          // Non-Windows-specific code goes here
          // process.kill(thread.pid, "SIGKILL");
          if (thread.pid) {
            try {
              process.kill(thread.pid, "SIGTERM");
            } catch (e) {
              logger.warn(`process ${thread.pid} not found`);
              logger.error(e);
            }
          } else {
            logger.warn(`Process ${thread.pid} does not exist.`);
          }
        }
      }
    }

    // Clear processing videos
    this.processingVideos.clear();
    this.setThreadQueue([]);
    this.setVideoSources([]);
  }

  setThreadQueue(queue) {
    this.threadQueue = queue;
  }

  setVideoSources(sources) {
    this.videoSources = sources;
  }

  getVideoSources() {
    return this.videoSources;
  }
}

module.exports = VideoStreamProcessor;
