using SparrowInterviewAI.Api.Services;

namespace SparrowInterviewAI.Api.Tests;

public class HashedEmbeddingServiceTests
{
    private readonly HashedEmbeddingService _service = new();

    [Fact]
    public void CreateEmbedding_ReturnsDimensionSizedVector()
    {
        var embedding = _service.CreateEmbedding("Tell me about a time you led a team.");

        Assert.Equal(HashedEmbeddingService.Dimensions, embedding.Length);
    }

    [Fact]
    public void CreateEmbedding_DifferentInputs_ProduceDifferentVectors()
    {
        var embedding1 = _service.CreateEmbedding("binary search algorithm");
        var embedding2 = _service.CreateEmbedding("behavioral leadership question");

        Assert.NotEqual(embedding1, embedding2);
    }

    [Fact]
    public void CreateEmbedding_SameInput_ProducesSameVector()
    {
        var embedding1 = _service.CreateEmbedding("How would you design a URL shortener?");
        var embedding2 = _service.CreateEmbedding("How would you design a URL shortener?");

        Assert.Equal(embedding1, embedding2);
    }

    [Fact]
    public void CreateEmbedding_EmptyInput_ReturnsZeroVector()
    {
        var embedding = _service.CreateEmbedding("");

        Assert.Equal(HashedEmbeddingService.Dimensions, embedding.Length);
        Assert.All(embedding, value => Assert.Equal(0f, value));
    }

    [Fact]
    public void ToVectorLiteral_ProducesValidPostgresFormat()
    {
        var embedding = _service.CreateEmbedding("test input");
        var literal = _service.ToVectorLiteral(embedding);

        Assert.StartsWith("[", literal);
        Assert.EndsWith("]", literal);
        Assert.Contains(",", literal);
    }
}
