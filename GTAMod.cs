using System;
using System.Net;
using System.IO;
using System.Windows.Forms;
using GTA;
using GTA.Math;
using GTA.Native;

public class TwitchStockMarket : Script
{
    private string SERVER_URL = "http://localhost:3000"; // Change if using remote server
    private int _lastUpdate = 0;
    
    // Logic Multipliers
    private float mGravity = 1.0f;
    private float mHealth = 1.0f;
    private float mPlayerHealth = 1.0f;
    private float mAccel = 1.0f;
    private float mTraction = 1.0f;
    private float mWanted = 1.0f;
    private float mArmor = 1.0f;
    
    public TwitchStockMarket()
    {
        Tick += OnTick;
        KeyDown += OnKeyDown;
        Interval = 100; // Run frequently
    }

    private void OnKeyDown(object sender, KeyEventArgs e)
    {
        if (e.KeyCode == Keys.Delete)
        {
            PerformReset();
        }
    }

    private void PerformReset()
    {
        // 1. Teleport
        Vector3 randomPos = World.GetNextPositionOnStreet(Game.Player.Character.Position + new Vector3(GTA.Math.Vector3.RandomXY().X * 3000, GTA.Math.Vector3.RandomXY().Y * 3000, 0));
        Game.Player.Character.Position = randomPos;

        // 2. Wipe Money (Set to 0)
        Function.Call(Hash.STAT_SET_INT, Game.GenerateHash("SP0_TOTAL_CASH"), 0, true);
        Function.Call(Hash.STAT_SET_INT, Game.GenerateHash("SP1_TOTAL_CASH"), 0, true);
        Function.Call(Hash.STAT_SET_INT, Game.GenerateHash("SP2_TOTAL_CASH"), 0, true);
        
        GTA.UI.Notification.Show("Game Reset: Zero Balance.");
    }

    private void OnTick(object sender, EventArgs e)
    {
        // Sync with Server every 500ms
        if (Game.GameTime > _lastUpdate + 500)
        {
            SyncWithServer();
            _lastUpdate = Game.GameTime;
        }

        ApplyPhysics();
    }

    private void SyncWithServer()
    {
        try
        {
            // Get Current Money
            int currentCash = Game.Player.Money;

            // Prepare Payload
            var httpWebRequest = (HttpWebRequest)WebRequest.Create($"{SERVER_URL}/api/game/sync");
            httpWebRequest.ContentType = "application/json";
            httpWebRequest.Method = "POST";

            using (var streamWriter = new StreamWriter(httpWebRequest.GetRequestStream()))
            {
                // Simple JSON string construction
                string json = $"{{\"currentMoney\": {currentCash}}}";
                streamWriter.Write(json);
            }

            // Get Response
            var httpResponse = (HttpWebResponse)httpWebRequest.GetResponse();
            using (var streamReader = new StreamReader(httpResponse.GetResponseStream()))
            {
                var result = streamReader.ReadToEnd();
                
                // 1. Parse Money Adjustment (If you bought stock on phone)
                int adj = (int)ParseJsonFloat(result, "adjustMoney", 0);
                if (adj != 0)
                {
                    Game.Player.Money += adj;
                    string operation = adj > 0 ? "Sold Stock" : "Bought Stock";
                    GTA.UI.Notification.Show($"{operation}: {adj:+$0}");
                }

                // 2. Parse Multipliers
                mGravity = ParseJsonFloat(result, "GRAVITY", 0f);
                mHealth = ParseJsonFloat(result, "NPC_HEALTH", 1.0f);
                mPlayerHealth = ParseJsonFloat(result, "PLAYER_HEALTH", 1.0f);
                mAccel = ParseJsonFloat(result, "ACCELERATION", 1.0f);
                mTraction = ParseJsonFloat(result, "TRACTION", 1.0f);
                mWanted = ParseJsonFloat(result, "WANTED", 1.0f);
                mArmor = ParseJsonFloat(result, "ARMOR", 1.0f);
            }
        }
        catch 
        { 
            // Server likely offline or busy
        }
    }

    private void ApplyPhysics()
    {
        // GRAVITY
        World.GravityLevel = 9.8f / mGravity;
        // WANTED
        Function.Call(Hash.SET_WANTED_LEVEL_DIFFICULTY, mWanted);

        // ARMOR
        Game.Player.MaxArmor = (int)(100 * mArmor);
        // VEHICLE / NPC
        foreach (Vehicle v in World.GetAllVehicles())
        {
            Function.Call(Hash.SET_VEHICLE_CHEAT_POWER_INCREASE, v, mAccel);
            if (mTraction > 1.2f) Function.Call(Hash.SET_VEHICLE_REDUCE_GRIP, v, true);
            else Function.Call(Hash.SET_VEHICLE_REDUCE_GRIP, v, false);
        }

        foreach (Ped p in World.GetNearbyPeds(Game.Player.Character, 100f))
        {
            if (!p.IsPlayer)
            {
                p.MaxHealth = (int)(200 * mHealth);
            }
        }

        Game.Player.Character.MaxHealth = (int)(200 * mPlayerHealth);
    }

    // Rough JSON Parser for minimal dependencies
    private float ParseJsonFloat(string json, string key, float defaultVal)
    {
        // Looks for "key":123.45 or "key": 123
        try {
            string search = $"\"{key}\"";
            int start = json.IndexOf(search);
            if (start == -1) return defaultVal;

            start = json.IndexOf(":", start) + 1;
            int endComma = json.IndexOf(",", start);
            int endBrace = json.IndexOf("}", start);
            
            int end = -1;
            if (endComma == -1) end = endBrace;
            else if (endBrace == -1) end = endComma;
            else end = Math.Min(endComma, endBrace);

            if (end == -1) return defaultVal;

            string valStr = json.Substring(start, end - start).Trim();
            return float.Parse(valStr, System.Globalization.CultureInfo.InvariantCulture);
        } catch {
            return defaultVal;
        }
    }
}