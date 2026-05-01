using SparrowInterviewAI.Api.Repositories;

namespace SparrowInterviewAI.Api.Services;

public class BackgroundJobService : BackgroundService
{
    private readonly IServiceProvider _services;
    private readonly ILogger<BackgroundJobService> _logger;
    private static readonly TimeSpan PollInterval = TimeSpan.FromSeconds(5);

    public BackgroundJobService(IServiceProvider services, ILogger<BackgroundJobService> logger)
    {
        _services = services;
        _logger = logger;
    }

    protected override async Task ExecuteAsync(CancellationToken stoppingToken)
    {
        _logger.LogInformation("BackgroundJobService started.");

        while (!stoppingToken.IsCancellationRequested)
        {
            try
            {
                using var scope = _services.CreateScope();
                var jobRepo = scope.ServiceProvider.GetRequiredService<ProcessingJobRepository>();
                var job = await jobRepo.DequeueAsync();

                if (job is null)
                {
                    await Task.Delay(PollInterval, stoppingToken);
                    continue;
                }

                _logger.LogInformation("Processing job {JobId} of type {JobType} for entity {EntityId}",
                    job.Id, job.JobType, job.EntityId);

                try
                {
                    await ProcessJobAsync(scope.ServiceProvider, job);
                    await jobRepo.MarkCompletedAsync(job.Id);
                    _logger.LogInformation("Job {JobId} completed.", job.Id);
                }
                catch (Exception ex)
                {
                    _logger.LogError(ex, "Job {JobId} failed.", job.Id);
                    await jobRepo.MarkFailedAsync(job.Id, ex.Message);
                }
            }
            catch (OperationCanceledException) when (stoppingToken.IsCancellationRequested)
            {
                break;
            }
            catch (Exception ex)
            {
                _logger.LogError(ex, "Background job polling failed.");
                await Task.Delay(PollInterval, stoppingToken);
            }
        }

        _logger.LogInformation("BackgroundJobService stopped.");
    }

    private static async Task ProcessJobAsync(IServiceProvider services, ProcessingJobRecord job)
    {
        switch (job.JobType)
        {
            case "document_parse":
                var ingestion = services.GetRequiredService<DocumentIngestionService>();
                await ingestion.ReprocessDocumentAsync(job.EntityId);
                break;

            case "embedding":
                var embeddingIngestion = services.GetRequiredService<DocumentIngestionService>();
                await embeddingIngestion.ReprocessDocumentAsync(job.EntityId);
                break;

            default:
                throw new NotSupportedException($"Job type '{job.JobType}' is not handled.");
        }
    }
}
