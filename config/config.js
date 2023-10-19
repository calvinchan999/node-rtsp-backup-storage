require("dotenv/config");
const config = {
  port: 5000,
  httpProtocol: process.env.HTTP_PROTOCOL ?? "http",
  rtspProtocol: "rtsp",
  rtspServerUrl:
    process.env.RTSP_SERVER_URL ?? "qmh-vm.eastasia.cloudapp.azure.com:8554",
  rtspApiServerUrl:
    process.env.RTSP_API_SERVER_URL ??
    "qmh-vm.eastasia.cloudapp.azure.com:9997",
  azureStorageAccount: {
    connectionString:
      process.env.CONNECTION_STRING ??
      "DefaultEndpointsProtocol=https;AccountName=devstgeacct;AccountKey=vZcNu8pCri5kX7rpBeHe+g9EbvX3ADRbFtA6G1jJvi/iECao9IlgAWbcC5qNhmnvGEdf5jSypfdp+AStk4Elvw==;EndpointSuffix=core.windows.net",
    container: process.env.AZURE_CONTAINER ?? "test",
    azureBlobToken:
      process.env.AZURE_BLOB_TOKEN ??
      "sp=r&st=2023-10-19T04:00:26Z&se=2023-10-19T12:00:26Z&spr=https&sv=2022-11-02&sr=c&sig=vM8%2BTw93MxoJVAv3xBCr3r%2FLCAouEPggUDAXgw%2BMt5g%3D",
    azureBlobUrl:
      process.env.AZURE_BLOB_URL ??
      "https://devstgeacct.blob.core.windows.net/test?sp=r&st=2023-10-19T04:00:26Z&se=2023-10-19T12:00:26Z&spr=https&sv=2022-11-02&sr=c&sig=vM8%2BTw93MxoJVAv3xBCr3r%2FLCAouEPggUDAXgw%2BMt5g%3D",
  },
  log: {
    azureStorageName: process.env.STORAGE_ACCOUNT_NAME ?? "qmhstgeacct",
    azureStorageKey:
      process.env.STORAGE_ACCOUNT_KEY ??
      "ziJgf1f2WCu21pQCS6uVs5zh6tkfKWOUtS7Z1CqPYZOpIBfG1joBoLN4VaK0K4cdXB/IgRrbmSGR+AStownJMQ==",
    azureContainerName:
      process.env.AZURE_LOGS_CONTAINER_NAME ?? "qmh-backup-storage-logs",
  },
  localCamera: [
    {
      name: "rv-01",
      url: "rtsp://admin:rvautotech2015@169.254.33.165:554/Streaming/Channels/101",
    },
  ],
  videoOutputResolution: "640x360"
};
module.exports = config;
