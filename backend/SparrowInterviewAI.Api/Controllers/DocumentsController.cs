using Microsoft.AspNetCore.Mvc;
using SparrowInterviewAI.Api.Repositories;
using SparrowInterviewAI.Api.Services;

namespace SparrowInterviewAI.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class DocumentsController : ControllerBase
{
    private readonly DocumentRepository _documents;
    private readonly DocumentIngestionService _ingestion;

    public DocumentsController(DocumentRepository documents, DocumentIngestionService ingestion)
    {
        _documents = documents;
        _ingestion = ingestion;
    }

    [HttpGet("user/{userId:guid}")]
    public async Task<IActionResult> GetByUser(Guid userId)
    {
        var docs = await _documents.GetByUserAsync(userId);
        return Ok(docs);
    }

    [HttpPost("upload")]
    public async Task<IActionResult> Upload([FromForm] Guid userId, [FromForm] string documentType, IFormFile file)
    {
        if (userId == Guid.Empty)
            return BadRequest("A valid userId is required.");

        if (string.IsNullOrWhiteSpace(documentType))
            return BadRequest("Document type is required.");

        if (file is null)
            return BadRequest("A file is required.");

        if (file.Length == 0)
            return BadRequest("File is empty.");

        var uploadsDir = Path.Combine(Directory.GetCurrentDirectory(), "uploads", userId.ToString());
        Directory.CreateDirectory(uploadsDir);

        var originalFileName = Path.GetFileName(file.FileName);
        var storedFileName = $"{Guid.NewGuid():N}_{originalFileName}";
        var filePath = Path.Combine(uploadsDir, storedFileName);
        using (var stream = new FileStream(filePath, FileMode.Create))
        {
            await file.CopyToAsync(stream);
        }

        var doc = await _documents.CreateAsync(
            userId,
            documentType,
            originalFileName,
            file.ContentType,
            file.Length,
            filePath);

        doc = await _ingestion.ProcessAsync(doc);

        return Created($"/api/documents/user/{userId}", doc);
    }
}
