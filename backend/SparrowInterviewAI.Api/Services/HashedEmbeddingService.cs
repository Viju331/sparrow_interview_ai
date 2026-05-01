using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.RegularExpressions;

namespace SparrowInterviewAI.Api.Services;

public sealed partial class HashedEmbeddingService
{
    public const int Dimensions = 1536;

    [GeneratedRegex(@"[A-Za-z0-9\+#\.-]+", RegexOptions.Compiled)]
    private static partial Regex TokenRegex();

    public float[] CreateEmbedding(string? text)
    {
        var vector = new float[Dimensions];
        if (string.IsNullOrWhiteSpace(text))
        {
            return vector;
        }

        foreach (var token in ExtractKeywords(text, 256))
        {
            var hash = SHA256.HashData(Encoding.UTF8.GetBytes(token));
            var index = BitConverter.ToUInt16(hash, 0) % Dimensions;
            var sign = (hash[2] & 1) == 0 ? 1f : -1f;
            var magnitude = 1f + (hash[3] / 255f);
            vector[index] += sign * magnitude;
        }

        Normalize(vector);
        return vector;
    }

    public string ToVectorLiteral(float[] vector)
    {
        return "[" + string.Join(
            ",",
            vector.Select(value => value.ToString("0.######", CultureInfo.InvariantCulture))) + "]";
    }

    public IReadOnlyList<string> ExtractKeywords(string? text, int maxTokens = 12)
    {
        if (string.IsNullOrWhiteSpace(text))
        {
            return Array.Empty<string>();
        }

        var counts = new Dictionary<string, int>(StringComparer.OrdinalIgnoreCase);
        foreach (Match match in TokenRegex().Matches(text.ToLowerInvariant()))
        {
            var token = match.Value.Trim();
            if (token.Length < 3)
            {
                continue;
            }

            counts[token] = counts.TryGetValue(token, out var count) ? count + 1 : 1;
        }

        return counts
            .OrderByDescending(pair => pair.Value)
            .ThenBy(pair => pair.Key)
            .Take(maxTokens)
            .Select(pair => pair.Key)
            .ToArray();
    }

    private static void Normalize(float[] vector)
    {
        double sum = 0;
        foreach (var value in vector)
        {
            sum += value * value;
        }

        if (sum <= double.Epsilon)
        {
            return;
        }

        var scale = (float)(1.0 / Math.Sqrt(sum));
        for (var index = 0; index < vector.Length; index++)
        {
            vector[index] *= scale;
        }
    }
}
