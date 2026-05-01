using Dapper;
using SparrowInterviewAI.Api.Configuration;
using SparrowInterviewAI.Api.Hubs;
using SparrowInterviewAI.Api.Repositories;
using SparrowInterviewAI.Api.Services;

var builder = WebApplication.CreateBuilder(args);
DefaultTypeMap.MatchNamesWithUnderscores = true;

builder.Services.Configure<ProviderOptions>(builder.Configuration.GetSection("Providers"));
builder.Services.AddHttpClient();

// Database
builder.Services.AddSingleton<DbConnectionFactory>();

// Repositories
builder.Services.AddScoped<UserRepository>();
builder.Services.AddScoped<SessionRepository>();
builder.Services.AddScoped<DocumentRepository>();
builder.Services.AddScoped<SettingsRepository>();
builder.Services.AddScoped<ProcessingJobRepository>();

// Runtime services
builder.Services.AddSingleton<HashedEmbeddingService>();
builder.Services.AddScoped<ExternalProviderService>();
builder.Services.AddScoped<PromptTemplateService>();
builder.Services.AddScoped<DocumentIngestionService>();
builder.Services.AddScoped<SessionBroadcastService>();
builder.Services.AddScoped<SessionRuntimeService>();
builder.Services.AddScoped<SessionAuthService>();
builder.Services.AddHostedService<BackgroundJobService>();

// Controllers + SignalR
builder.Services.AddControllers();
builder.Services.AddSignalR();
builder.Services.AddOpenApi();

// CORS for Electron dev and production
builder.Services.AddCors(options =>
{
    options.AddPolicy("ElectronDev", policy =>
    {
        policy.WithOrigins("http://localhost:4200")
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });

    options.AddPolicy("Production", policy =>
    {
        var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
            ?? ["https://sparrowinterviewai.com"];
        policy.WithOrigins(allowedOrigins)
              .AllowAnyHeader()
              .AllowAnyMethod()
              .AllowCredentials();
    });
});

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.MapOpenApi();
    app.UseCors("ElectronDev");
}
else
{
    app.UseHttpsRedirection();
    app.UseCors("Production");
}

app.UseAuthorization();
app.MapControllers();
app.MapHub<SessionHub>("/hubs/session");

app.Run();
