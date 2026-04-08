"""Live weather lookup helpers backed by the public Open-Meteo APIs."""

from __future__ import annotations

import ssl
import time
from typing import Any

import httpx


_WEATHER_CODE_LABELS: dict[int, str] = {
    0: "晴",
    1: "大体晴朗",
    2: "局部多云",
    3: "阴天",
    45: "有雾",
    48: "雾凇",
    51: "小毛毛雨",
    53: "毛毛雨",
    55: "大毛毛雨",
    56: "冻毛毛雨",
    57: "强冻毛毛雨",
    61: "小雨",
    63: "中雨",
    65: "大雨",
    66: "冻雨",
    67: "强冻雨",
    71: "小雪",
    73: "中雪",
    75: "大雪",
    77: "米雪",
    80: "阵雨",
    81: "强阵雨",
    82: "暴雨阵雨",
    85: "阵雪",
    86: "强阵雪",
    95: "雷暴",
    96: "雷暴夹小冰雹",
    99: "雷暴夹大冰雹",
}


def _contains_cjk(text: str) -> bool:
    """Return whether a string contains at least one CJK character."""

    return any("\u4e00" <= character <= "\u9fff" for character in text)


def _normalize_city_name(name: str | None) -> str:
    """Normalize a city-like string so duplicate place names can be ranked more reliably."""

    if not name:
        return ""

    return name.strip().removesuffix("市").removesuffix("区").removesuffix("县").lower()


def _city_search_queries(city: str) -> list[str]:
    """Build a short list of query variants for ambiguous city names."""

    normalized = city.strip()
    queries = [normalized]

    if not _contains_cjk(normalized):
        return queries

    if not normalized.endswith("市"):
        queries.append(f"{normalized}市")
    elif len(normalized) > 1:
        queries.append(normalized.removesuffix("市"))

    return queries


def _feature_priority(feature_code: str | None) -> int:
    """Return a priority score for administrative settlement feature codes."""

    priorities = {
        "PPLC": 60,
        "PPLA": 50,
        "PPLA2": 40,
        "PPLA3": 35,
        "PPLA4": 30,
        "PPL": 20,
    }

    return priorities.get(str(feature_code or ""), 0)


def _fetch_json(url: str, params: dict[str, Any]) -> dict[str, Any]:
    """Perform a blocking JSON HTTP request for tool execution inside agent frameworks.

    Open-Meteo is a public upstream endpoint. In some local environments, inherited
    proxy variables can cause TLS negotiation failures such as
    `SSL: UNEXPECTED_EOF_WHILE_READING`.

    To keep the backend demo stable, weather lookups bypass environment proxy
    settings by default and surface a clearer application-level error when the
    upstream request fails.
    """

    last_error: Exception | None = None

    for attempt, timeout in enumerate((10.0, 20.0), start=1):
        try:
            response = httpx.get(
                url,
                params=params,
                timeout=timeout,
                follow_redirects=True,
                trust_env=False,
                headers={
                    "User-Agent": "agentdown-weather-demo/0.0.3",
                    "Accept": "application/json",
                },
            )
            response.raise_for_status()
            return response.json()
        except (httpx.HTTPError, ssl.SSLError) as exc:
            last_error = exc

            if attempt >= 2:
                break

            time.sleep(0.4)

    raise RuntimeError(f"天气服务请求失败: {last_error}") from last_error


def _select_best_location(city: str, candidates: list[dict[str, Any]]) -> dict[str, Any]:
    """Select the most likely city candidate from a geocoding response."""

    if not candidates:
        raise ValueError(f"无法找到城市：{city}")

    city_key = _normalize_city_name(city)

    def location_score(item: dict[str, Any]) -> float:
        """Compute a heuristic score for a geocoding candidate."""

        name = str(item.get("name") or "")
        name_key = _normalize_city_name(name)
        population = float(item.get("population") or 0)
        score = float(_feature_priority(item.get("feature_code")))

        if name == city:
            score += 80
        if name_key == city_key:
            score += 60
        if name == f"{city}市":
            score += 40

        score += min(population / 1_000_000, 20)
        return score

    return max(candidates, key=location_score)


def _lookup_coordinates(city: str) -> dict[str, Any]:
    """Resolve a city name into coordinates with a small set of search variants."""

    candidates: list[dict[str, Any]] = []

    for query in _city_search_queries(city):
        payload = _fetch_json(
            "https://geocoding-api.open-meteo.com/v1/search",
            {
                "name": query,
                "count": 5,
                "language": "zh",
                "format": "json",
            },
        )
        results = payload.get("results") or []
        candidates.extend(results)

    return _select_best_location(city, candidates)


def _describe_weather_code(code: int | None) -> str:
    """Convert a WMO weather code into a compact Chinese description."""

    if code is None:
        return "未知天气"

    return _WEATHER_CODE_LABELS.get(code, f"天气代码 {code}")


def lookup_live_weather(city: str) -> dict[str, Any]:
    """Return the live weather for a city using the public Open-Meteo APIs."""

    location = _lookup_coordinates(city)
    forecast = _fetch_json(
        "https://api.open-meteo.com/v1/forecast",
        {
            "latitude": location["latitude"],
            "longitude": location["longitude"],
            "current": (
                "temperature_2m,relative_humidity_2m,weather_code,"
                "wind_speed_10m,wind_direction_10m,is_day"
            ),
            "timezone": "auto",
        },
    )
    current = forecast.get("current") or {}
    weather_code = current.get("weather_code")

    return {
        "city": city,
        "resolvedName": location.get("name", city),
        "country": location.get("country"),
        "admin1": location.get("admin1"),
        "latitude": location.get("latitude"),
        "longitude": location.get("longitude"),
        "condition": _describe_weather_code(weather_code),
        "weatherCode": weather_code,
        "tempC": current.get("temperature_2m"),
        "humidity": current.get("relative_humidity_2m"),
        "windSpeedKmh": current.get("wind_speed_10m"),
        "windDirectionDeg": current.get("wind_direction_10m"),
        "isDay": current.get("is_day"),
        "observedAt": current.get("time"),
        "timezone": forecast.get("timezone"),
        "source": "open-meteo",
    }
