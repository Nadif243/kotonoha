use serde::{Deserialize, Serialize};
use scraper::{Html, Selector, Element};

// ==========================================
// 1. STRUCTS DEFINITION
// ==========================================

#[derive(Debug, Serialize, Deserialize)]
pub struct SenseDefinition {
    pub parts_of_speech: Vec<String>,
    pub definitions: Vec<String>,
    pub see_also: Option<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct KanjiRadical {
    pub symbol: String,
    pub meaning: String,
    pub forms: Option<String>,
    pub parts: Vec<String>,
    pub variants: Vec<String>,
}

#[derive(Debug, Serialize, Deserialize)]
pub struct KanjiDetail {
    pub kanji: String,
    pub jlpt: Option<String>,
    pub grade: Option<String>,
    pub stroke_count: u32,
    pub meanings: Vec<String>,
    pub readings_kun: Vec<String>,
    pub readings_on: Vec<String>,
    pub radical: Option<KanjiRadical>,
}

// ==========================================
// 2. RUST COMMANDS
// ==========================================

// 1: Fetch Word Definitions
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
// 2: Fetch Kanji Breakdown (Radical, Forms, Parts, Variants)
#[tauri::command]
async fn fetch_jisho_kanji(kanji: String) -> Result<KanjiDetail, String> {
    let client = reqwest::Client::new();
    let url = format!(
        "https://jisho.org/search/{}%20%23kanji",
        urlencoding::encode(&kanji)
    );

    if let Ok(res) = client
        .get(&url)
        .header("User-Agent", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)")
        .send()
        .await
    {
        if res.status().is_success() {
            if let Ok(html_text) = res.text().await {
                let document = Html::parse_document(&html_text);

                // 1. Extract Strokes via Regex/String search
                let mut stroke_count = 0;
                if let Some(idx) = html_text.find("stroke_count") {
                    let snippet = &html_text[idx..idx + 100];
                    let digits: String = snippet.chars().filter(|c| c.is_ascii_digit()).collect();
                    if let Ok(num) = digits.parse::<u32>() {
                        stroke_count = num;
                    }
                } else if let Some(idx) = html_text.find("strokes") {
                    let snippet = &html_text[idx.saturating_sub(30)..idx];
                    let digits: String = snippet.chars().filter(|c| c.is_ascii_digit()).collect();
                    if let Ok(num) = digits.parse::<u32>() {
                        stroke_count = num;
                    }
                }

                // 2. Extract JLPT
                let jlpt_selector = Selector::parse(".jlpt strong").unwrap();
                let jlpt = document
                    .select(&jlpt_selector)
                    .next()
                    .map(|el| format!("JLPT {}", el.text().collect::<String>().trim().to_uppercase()));

                // 3. Extract Grade
                let grade_selector = Selector::parse(".grade strong").unwrap();
                let grade = document
                    .select(&grade_selector)
                    .next()
                    .map(|el| {
                        let raw = el.text().collect::<String>().trim().to_string();
                        let clean_num = raw.chars().filter(|c| c.is_ascii_digit()).collect::<String>();
                        if clean_num.is_empty() {
                            format!("Grade {}", raw)
                        } else {
                            format!("Grade {}", clean_num)
                        }
                    });

                // 4. Extract Meanings
                let meaning_selector = Selector::parse(".kanji-details__main-meanings").unwrap();
                let meanings: Vec<String> = document
                    .select(&meaning_selector)
                    .map(|el| el.text().collect::<String>().trim().to_string())
                    .filter(|s| !s.is_empty())
                    .collect();

                // 5. Extract Kun & On Readings
                let mut readings_kun = Vec::new();
                let mut readings_on = Vec::new();

                // A. Try from class kun_yomi / on_yomi
                let kun_selector = Selector::parse(".kanji-details__kunings a, .kun_yomi a, .kunings a").unwrap();
                readings_kun = document
                    .select(&kun_selector)
                    .map(|el| el.text().collect::<String>().trim().to_string())
                    .filter(|s| !s.is_empty() && !s.contains("More"))
                    .collect();

                let on_selector = Selector::parse(".kanji-details__onings a, .on_yomi a, .onings a").unwrap();
                readings_on = document
                    .select(&on_selector)
                    .map(|el| el.text().collect::<String>().trim().to_string())
                    .filter(|s| !s.is_empty() && !s.contains("More"))
                    .collect();

                // B. Fallback if A empty: look via dl/dt/dd "Kun:" & "On:"
                if readings_kun.is_empty() || readings_on.is_empty() {
                    let dt_selector = Selector::parse("dt").unwrap();
                    let a_selector = Selector::parse("a").unwrap();

                    for dt in document.select(&dt_selector) {
                        let text = dt.text().collect::<String>().trim().to_lowercase();
                        if text.starts_with("kun") && readings_kun.is_empty() {
                            if let Some(dd) = dt.next_sibling_element() {
                                readings_kun = dd
                                    .select(&a_selector)
                                    .map(|a| a.text().collect::<String>().trim().to_string())
                                    .filter(|s| !s.is_empty())
                                    .collect();
                            }
                        } else if text.starts_with("on") && readings_on.is_empty() {
                            if let Some(dd) = dt.next_sibling_element() {
                                readings_on = dd
                                    .select(&a_selector)
                                    .map(|a| a.text().collect::<String>().trim().to_string())
                                    .filter(|s| !s.is_empty())
                                    .collect();
                            }
                        }
                    }
                }

                // 6. Extract Radical, Forms, Meaning & Symbol
                let radical_selector = Selector::parse(".radicals").unwrap();
                let mut radical_symbol = kanji.clone();
                let mut radical_meaning = "radical".to_string();
                let mut radical_forms = None;

                if let Some(rad_el) = document.select(&radical_selector).next() {
                    let rad_text = rad_el.text().collect::<String>();
                    if let Some(idx) = rad_text.find("Radical:") {
                        let clean = rad_text[idx + 8..].trim();
                        if let Some(b_start) = clean.find('(') {
                            if let Some(b_end) = clean.find(')') {
                                radical_forms = Some(clean[b_start..=b_end].to_string());
                                let main_part = clean[..b_start].trim();
                                let parts_tokens: Vec<&str> = main_part.split_whitespace().collect();
                                if parts_tokens.len() >= 2 {
                                    radical_meaning = parts_tokens[..parts_tokens.len() - 1].join(" ");
                                    radical_symbol = parts_tokens.last().unwrap_or(&"").to_string();
                                }
                            }
                        } else {
                            let parts_tokens: Vec<&str> = clean.split_whitespace().collect();
                            if parts_tokens.len() >= 2 {
                                radical_meaning = parts_tokens[..parts_tokens.len() - 1].join(" ");
                                radical_symbol = parts_tokens.last().unwrap_or(&"").to_string();
                            }
                        }
                    }
                }

                // 7. Extract Parts & Variants
                let mut parts = Vec::new();
                let mut variants = Vec::new();

                let dt_selector = Selector::parse("dt").unwrap();
                let a_selector = Selector::parse("a").unwrap();

                for dt in document.select(&dt_selector) {
                    let dt_text = dt.text().collect::<String>().trim().to_lowercase();

                    if dt_text.contains("part") {
                        if let Some(dd) = dt.next_sibling_element() {
                            parts = dd
                                .select(&a_selector)
                                .map(|a| a.text().collect::<String>().trim().to_string())
                                .filter(|s| !s.is_empty())
                                .collect();
                        }
                    }

                    if dt_text.contains("variant") {
                        if let Some(dd) = dt.next_sibling_element() {
                            variants = dd
                                .select(&a_selector)
                                .map(|a| a.text().collect::<String>().trim().to_string())
                                .filter(|s| !s.is_empty())
                                .collect();
                        }
                    }
                }

                return Ok(KanjiDetail {
                    kanji,
                    jlpt,
                    grade,
                    stroke_count,
                    meanings,
                    readings_kun,
                    readings_on,
                    radical: Some(KanjiRadical {
                        symbol: radical_symbol,
                        meaning: radical_meaning,
                        forms: radical_forms,
                        parts,
                        variants,
                    }),
                });
            }
        }
    }

    // Fallback minimal struct
    Ok(KanjiDetail {
        kanji: kanji.clone(),
        jlpt: None,
        grade: None,
        stroke_count: 0,
        meanings: vec![kanji.clone()],
        readings_kun: vec![],
        readings_on: vec![],
        radical: None,
    })
}

// ==========================================
// 3. TAURI ENTRY POINT
// ==========================================

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_sql::Builder::default().build())
        .invoke_handler(tauri::generate_handler![fetch_jisho_word, fetch_jisho_kanji])
        .setup(|_app| Ok(()))
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
