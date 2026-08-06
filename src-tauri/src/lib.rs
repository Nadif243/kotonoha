use serde::{Deserialize, Serialize};

// 1. Define Struct Response
#[derive(Debug, Serialize, Deserialize)]
pub struct SenseDefinition {
    pub parts_of_speech: Vec<String>,
    pub definitions: Vec<String>,
    pub see_also: Option<String>,
}

// 2. Fetch Jisho Word Function (CORS Free)
#[tauri::command]
async fn fetch_jisho_word(keyword: String) -> Result<Vec<SenseDefinition>, String> {
    let url = format!(
        "https://jisho.org/api/v1/search/words?keyword={}",
        urlencoding::encode(&keyword)
    );

    let client = reqwest::Client::new();
    let response = client
        .get(&url)
        .header("User-Agent", "KotonohaApp/1.0")
        .send()
        .await
        .map_err(|e| e.to_string())?;

    if !response.status().is_success() {
        return Err(format!("API Error Status: {}", response.status()));
    }

    let json: serde_json::Value = response.json().await.map_err(|e| e.to_string())?;
    let mut results = Vec::new();

    if let Some(data) = json.get("data").and_then(|d| d.as_array()) {
        if let Some(primary_entry) = data.first() {
            if let Some(senses) = primary_entry.get("senses").and_then(|s| s.as_array()) {
                for sense in senses {
                    let pos = sense
                        .get("parts_of_speech")
                        .and_then(|p| p.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                .collect()
                        })
                        .unwrap_or_default();

                    let defs = sense
                        .get("english_definitions")
                        .and_then(|d| d.as_array())
                        .map(|arr| {
                            arr.iter()
                                .filter_map(|v| v.as_str().map(|s| s.to_string()))
                                .collect()
                        })
                        .unwrap_or_default();

                    let see_also = sense
                        .get("see_also")
                        .and_then(|sa| sa.as_array())
                        .and_then(|arr| arr.first())
                        .and_then(|v| v.as_str())
                        .map(|s| s.to_string());

                    results.push(SenseDefinition {
                        parts_of_speech: pos,
                        definitions: defs,
                        see_also,
                    });
                }
            }
        }
    }

    Ok(results)
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![fetch_jisho_word])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
