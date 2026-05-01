using Dapper;
using SparrowInterviewAI.Api.Configuration;
using System.Text.Json;

namespace SparrowInterviewAI.Api.Repositories;

public class SettingsRepository
{
    private readonly DbConnectionFactory _db;

    public SettingsRepository(DbConnectionFactory db) => _db = db;

    public async Task<Dictionary<string, JsonElement>> GetSettingsAsync(Guid userId)
    {
        using var conn = _db.CreateConnection();
        var rows = await conn.QueryAsync<(string SettingKey, string SettingValue)>(
            @"SELECT setting_key, setting_value::text AS setting_value
              FROM app_settings
              WHERE user_id = @UserId",
            new { UserId = userId });

        var settings = new Dictionary<string, JsonElement>();
        foreach (var row in rows)
        {
            try
            {
                settings[row.SettingKey] = JsonDocument.Parse(row.SettingValue).RootElement.Clone();
            }
            catch
            {
                // Skip malformed settings.
            }
        }

        return settings;
    }

    public async Task UpsertSettingAsync(Guid userId, string settingKey, string settingValueJson)
    {
        using var conn = _db.CreateConnection();
        await conn.ExecuteAsync(
            @"INSERT INTO app_settings (user_id, setting_key, setting_value)
              VALUES (@UserId, @SettingKey, CAST(@SettingValue AS jsonb))
              ON CONFLICT (user_id, setting_key)
              DO UPDATE SET setting_value = CAST(EXCLUDED.setting_value AS jsonb)",
            new { UserId = userId, SettingKey = settingKey, SettingValue = settingValueJson });
    }

    public async Task<IReadOnlyList<HotkeyBindingRecord>> GetHotkeyBindingsAsync(Guid userId)
    {
        using var conn = _db.CreateConnection();
        var results = await conn.QueryAsync<HotkeyBindingRecord>(
            @"SELECT id, user_id, action_name, key_combo, is_enabled, created_at, updated_at
              FROM hotkey_bindings
              WHERE user_id = @UserId
              ORDER BY action_name",
            new { UserId = userId });
        return results.ToList();
    }

    public async Task UpsertHotkeyBindingsAsync(Guid userId, IEnumerable<HotkeyBindingUpsert> bindings)
    {
        using var conn = _db.CreateConnection();
        conn.Open();
        using var tx = conn.BeginTransaction();

        foreach (var binding in bindings)
        {
            await conn.ExecuteAsync(
                @"INSERT INTO hotkey_bindings (user_id, action_name, key_combo, is_enabled)
                  VALUES (@UserId, @ActionName, @KeyCombo, @IsEnabled)
                  ON CONFLICT (user_id, action_name)
                  DO UPDATE SET key_combo = EXCLUDED.key_combo, is_enabled = EXCLUDED.is_enabled",
                new
                {
                    UserId = userId,
                    binding.ActionName,
                    binding.KeyCombo,
                    binding.IsEnabled
                },
                tx);
        }

        tx.Commit();
    }
}

public class HotkeyBindingRecord
{
    public Guid Id { get; set; }
    public Guid UserId { get; set; }
    public string ActionName { get; set; } = string.Empty;
    public string KeyCombo { get; set; } = string.Empty;
    public bool IsEnabled { get; set; } = true;
    public DateTime CreatedAt { get; set; }
    public DateTime UpdatedAt { get; set; }
}

public class HotkeyBindingUpsert
{
    public string ActionName { get; set; } = string.Empty;
    public string KeyCombo { get; set; } = string.Empty;
    public bool IsEnabled { get; set; } = true;
}
