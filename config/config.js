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
    container: process.env.AZURE_CONTAINER ?? "stream",
    azureBlobToken:
      process.env.AZURE_BLOB_TOKEN ??
      "sp=racwdli&st=2023-04-03T03:27:53Z&se=2050-03-04T11:27:53Z&spr=https&sv=2021-12-02&sr=c&sig=Bn6FMpyd0rWNU8nKGEAMuZzq72GvWWvo78HT3EMP9NA%3D",
    azureBlobUrl:
      process.env.AZURE_BLOB_URL ??
      "https://devstgeacct.blob.core.windows.net/stream?sp=racwdli&st=2023-04-03T03:27:53Z&se=2050-03-04T11:27:53Z&spr=https&sv=2021-12-02&sr=c&sig=Bn6FMpyd0rWNU8nKGEAMuZzq72GvWWvo78HT3EMP9NA%3D",
  },
  log: {
    azureStorageName: process.env.STORAGE_ACCOUNT_NAME ?? "qmhstgeacct",
    azureStorageKey:
      process.env.STORAGE_ACCOUNT_KEY ??
      "ziJgf1f2WCu21pQCS6uVs5zh6tkfKWOUtS7Z1CqPYZOpIBfG1joBoLN4VaK0K4cdXB/IgRrbmSGR+AStownJMQ==",
    azureContainerName:
      process.env.AZURE_LOGS_CONTAINER_NAME ?? "qmh-backup-storage-logs",
  },
};
module.exports = config;
