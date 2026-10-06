// GENERATED upstream from data/simulator-extract.json by the persona generator,
// which lives with the simulation and not in this kit. Do not edit by hand.
// Synthetic personas only. Interpreted outputs only. Zero PHI.
export default {
  "schema": "lifecare-sandbox-personas/v1",
  "generated_by": "scripts/sandbox_personas.py",
  "simulator": {
    "repo": "healthspannode",
    "module": "ops.challenge_sim",
    "persona_schema": "challenge-sim-persona/v1",
    "oracle_schema": "challenge-sim-oracle/v1",
    "scenario": "day_by_day"
  },
  "as_of": "2026-10-01",
  "persona_ids": [
    "p1-adherent-responder",
    "p2-glp1-muscle-loser",
    "p3-under-recovered",
    "p4-sparse-returner",
    "p5-glucose-anomaly"
  ],
  "personas": {
    "p1-adherent-responder": {
      "persona_id": "p1-adherent-responder",
      "display_name": "Adherent Responder",
      "synthetic": true,
      "window": {
        "first_day": "2026-09-02",
        "last_day": "2026-10-01"
      },
      "focus": "maintain",
      "headline": "The healthy case. Weight is coming down while lean mass holds, and nothing here needs correcting.",
      "weeks": [
        {
          "week_index": 0,
          "first_day": "2026-09-02",
          "last_day": "2026-09-08",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 76.0,
              "band": "on-track",
              "as_of": "2026-09-08",
              "direction": "first-reading"
            },
            "anabolic": {
              "covered": true,
              "score": 50.0,
              "band": "drifting",
              "as_of": "2026-09-08",
              "direction": "first-reading"
            },
            "glycemic": {
              "covered": false
            }
          },
          "sentence": "The first week: recovery on track, muscle stimulus drifting, glucose stability not measured."
        },
        {
          "week_index": 1,
          "first_day": "2026-09-09",
          "last_day": "2026-09-15",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 81.0,
              "band": "on-track",
              "as_of": "2026-09-15",
              "direction": "improving"
            },
            "anabolic": {
              "covered": true,
              "score": 100.0,
              "band": "on-track",
              "as_of": "2026-09-15",
              "direction": "improving"
            },
            "glycemic": {
              "covered": false
            }
          },
          "sentence": "The second week: recovery on track, muscle stimulus on track, glucose stability not measured."
        },
        {
          "week_index": 2,
          "first_day": "2026-09-16",
          "last_day": "2026-09-22",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 89.0,
              "band": "on-track",
              "as_of": "2026-09-22",
              "direction": "improving"
            },
            "anabolic": {
              "covered": true,
              "score": 100.0,
              "band": "on-track",
              "as_of": "2026-09-22",
              "direction": "steady"
            },
            "glycemic": {
              "covered": false
            }
          },
          "sentence": "The third week: recovery on track, muscle stimulus on track, glucose stability not measured."
        },
        {
          "week_index": 3,
          "first_day": "2026-09-23",
          "last_day": "2026-09-29",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 89.0,
              "band": "on-track",
              "as_of": "2026-09-29",
              "direction": "steady"
            },
            "anabolic": {
              "covered": true,
              "score": 100.0,
              "band": "on-track",
              "as_of": "2026-09-29",
              "direction": "steady"
            },
            "glycemic": {
              "covered": false
            }
          },
          "sentence": "The fourth week: recovery on track, muscle stimulus on track, glucose stability not measured."
        },
        {
          "week_index": 4,
          "first_day": "2026-09-30",
          "last_day": "2026-10-01",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 90.0,
              "band": "on-track",
              "as_of": "2026-10-01",
              "direction": "steady"
            },
            "anabolic": {
              "covered": true,
              "score": 100.0,
              "band": "on-track",
              "as_of": "2026-10-01",
              "direction": "steady"
            },
            "glycemic": {
              "covered": false
            }
          },
          "sentence": "The fifth week: recovery on track, muscle stimulus on track, glucose stability not measured."
        }
      ],
      "scopes": {
        "cgm": {
          "covered": false,
          "sentence": "No glucose sensor is connected, so there is no glycemic reading."
        },
        "daily": {
          "covered": true,
          "as_of": "2026-10-01",
          "focus": "maintain",
          "challenge": {
            "started_on": "2026-09-02",
            "week_index": 4,
            "weeks": 12
          },
          "logging": "every-day",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 90.0,
              "band": "on-track",
              "as_of": "2026-10-01"
            },
            "anabolic": {
              "covered": true,
              "score": 100.0,
              "band": "on-track",
              "as_of": "2026-10-01"
            },
            "glycemic": {
              "covered": false
            }
          },
          "uncovered": [
            "glycemic"
          ],
          "days": [
            {
              "date": "2026-09-02",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-03",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-04",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-05",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-06",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "drifting"
              }
            },
            {
              "date": "2026-09-07",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "drifting"
              }
            },
            {
              "date": "2026-09-08",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "drifting"
              }
            },
            {
              "date": "2026-09-09",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "drifting"
              }
            },
            {
              "date": "2026-09-10",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "drifting"
              }
            },
            {
              "date": "2026-09-11",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-12",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-13",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-14",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-15",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-16",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-17",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-18",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-19",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-20",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-21",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-22",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-23",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-24",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-25",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-26",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-27",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-28",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-29",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-30",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-10-01",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "on-track"
              }
            }
          ],
          "sentence": "The healthy case. Weight is coming down while lean mass holds, and nothing here needs correcting."
        },
        "labs": {
          "covered": false,
          "sentence": "No laboratory results exist for this persona."
        },
        "body_composition": {
          "covered": true,
          "status": "tracking",
          "retention_band": "excellent",
          "weight_direction": "down",
          "lean_direction": "flat",
          "lean_source": "measured",
          "first_day": "2026-09-02",
          "last_day": "2026-10-01",
          "sentence": "Lean mass is holding while weight comes down. Retention reads excellent."
        },
        "recovery": {
          "covered": true,
          "pillar": "recovery",
          "score": 90.0,
          "band": "on-track",
          "as_of": "2026-10-01",
          "weekly": [
            {
              "week_index": 0,
              "first_day": "2026-09-02",
              "last_day": "2026-09-08",
              "covered": true,
              "score": 76.0,
              "band": "on-track",
              "as_of": "2026-09-08",
              "direction": "first-reading"
            },
            {
              "week_index": 1,
              "first_day": "2026-09-09",
              "last_day": "2026-09-15",
              "covered": true,
              "score": 81.0,
              "band": "on-track",
              "as_of": "2026-09-15",
              "direction": "improving"
            },
            {
              "week_index": 2,
              "first_day": "2026-09-16",
              "last_day": "2026-09-22",
              "covered": true,
              "score": 89.0,
              "band": "on-track",
              "as_of": "2026-09-22",
              "direction": "improving"
            },
            {
              "week_index": 3,
              "first_day": "2026-09-23",
              "last_day": "2026-09-29",
              "covered": true,
              "score": 89.0,
              "band": "on-track",
              "as_of": "2026-09-29",
              "direction": "steady"
            },
            {
              "week_index": 4,
              "first_day": "2026-09-30",
              "last_day": "2026-10-01",
              "covered": true,
              "score": 90.0,
              "band": "on-track",
              "as_of": "2026-10-01",
              "direction": "steady"
            }
          ],
          "sentence": "Recovery is on track: sleep and overnight recovery signals are holding.",
          "sleep_label": "well-rested"
        },
        "activity": {
          "covered": true,
          "pillar": "anabolic",
          "score": 100.0,
          "band": "on-track",
          "as_of": "2026-10-01",
          "weekly": [
            {
              "week_index": 0,
              "first_day": "2026-09-02",
              "last_day": "2026-09-08",
              "covered": true,
              "score": 50.0,
              "band": "drifting",
              "as_of": "2026-09-08",
              "direction": "first-reading"
            },
            {
              "week_index": 1,
              "first_day": "2026-09-09",
              "last_day": "2026-09-15",
              "covered": true,
              "score": 100.0,
              "band": "on-track",
              "as_of": "2026-09-15",
              "direction": "improving"
            },
            {
              "week_index": 2,
              "first_day": "2026-09-16",
              "last_day": "2026-09-22",
              "covered": true,
              "score": 100.0,
              "band": "on-track",
              "as_of": "2026-09-22",
              "direction": "steady"
            },
            {
              "week_index": 3,
              "first_day": "2026-09-23",
              "last_day": "2026-09-29",
              "covered": true,
              "score": 100.0,
              "band": "on-track",
              "as_of": "2026-09-29",
              "direction": "steady"
            },
            {
              "week_index": 4,
              "first_day": "2026-09-30",
              "last_day": "2026-10-01",
              "covered": true,
              "score": 100.0,
              "band": "on-track",
              "as_of": "2026-10-01",
              "direction": "steady"
            }
          ],
          "sentence": "Muscle stimulus is on track: resistance sessions are landing at the weekly target.",
          "training_modality": "with-weights",
          "movement_band": "good"
        },
        "insights": {
          "covered": true,
          "latest": [
            {
              "family": "activity",
              "kind": "activity.adherence",
              "generated_at": "2026-10-01T20:00:00Z",
              "label": "good"
            },
            {
              "family": "recovery",
              "kind": "recovery.state_label",
              "generated_at": "2026-10-01T20:00:00Z",
              "label": "good"
            },
            {
              "family": "sleep",
              "kind": "sleep.state_label",
              "generated_at": "2026-10-01T20:00:00Z",
              "label": "well-rested"
            },
            {
              "family": "training",
              "kind": "training.adherence",
              "generated_at": "2026-10-01T20:00:00Z",
              "label": "good"
            }
          ],
          "sentence": "The newest derived insight per family: activity, recovery, sleep, training. Each carries a categorical label, never a reading."
        }
      }
    },
    "p2-glp1-muscle-loser": {
      "persona_id": "p2-glp1-muscle-loser",
      "display_name": "GLP-1 Muscle Loser",
      "synthetic": true,
      "window": {
        "first_day": "2026-09-02",
        "last_day": "2026-10-01"
      },
      "focus": "anabolic",
      "headline": "Weight is coming down quickly and a meaningful share of it is lean mass. Every logged session is cardio, so resistance training is the lever.",
      "weeks": [
        {
          "week_index": 0,
          "first_day": "2026-09-02",
          "last_day": "2026-09-08",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 73.0,
              "band": "on-track",
              "as_of": "2026-09-08",
              "direction": "first-reading"
            },
            "anabolic": {
              "covered": true,
              "score": 0.0,
              "band": "off-track",
              "as_of": "2026-09-08",
              "direction": "first-reading"
            },
            "glycemic": {
              "covered": false
            }
          },
          "sentence": "The first week: recovery on track, muscle stimulus off track, glucose stability not measured."
        },
        {
          "week_index": 1,
          "first_day": "2026-09-09",
          "last_day": "2026-09-15",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 67.0,
              "band": "drifting",
              "as_of": "2026-09-15",
              "direction": "declining"
            },
            "anabolic": {
              "covered": true,
              "score": 0.0,
              "band": "off-track",
              "as_of": "2026-09-15",
              "direction": "steady"
            },
            "glycemic": {
              "covered": false
            }
          },
          "sentence": "The second week: recovery drifting, muscle stimulus off track, glucose stability not measured."
        },
        {
          "week_index": 2,
          "first_day": "2026-09-16",
          "last_day": "2026-09-22",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 66.0,
              "band": "drifting",
              "as_of": "2026-09-22",
              "direction": "steady"
            },
            "anabolic": {
              "covered": true,
              "score": 0.0,
              "band": "off-track",
              "as_of": "2026-09-22",
              "direction": "steady"
            },
            "glycemic": {
              "covered": false
            }
          },
          "sentence": "The third week: recovery drifting, muscle stimulus off track, glucose stability not measured."
        },
        {
          "week_index": 3,
          "first_day": "2026-09-23",
          "last_day": "2026-09-29",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 54.0,
              "band": "drifting",
              "as_of": "2026-09-29",
              "direction": "declining"
            },
            "anabolic": {
              "covered": true,
              "score": 0.0,
              "band": "off-track",
              "as_of": "2026-09-29",
              "direction": "steady"
            },
            "glycemic": {
              "covered": false
            }
          },
          "sentence": "The fourth week: recovery drifting, muscle stimulus off track, glucose stability not measured."
        },
        {
          "week_index": 4,
          "first_day": "2026-09-30",
          "last_day": "2026-10-01",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 55.0,
              "band": "drifting",
              "as_of": "2026-10-01",
              "direction": "steady"
            },
            "anabolic": {
              "covered": true,
              "score": 0.0,
              "band": "off-track",
              "as_of": "2026-10-01",
              "direction": "steady"
            },
            "glycemic": {
              "covered": false
            }
          },
          "sentence": "The fifth week: recovery drifting, muscle stimulus off track, glucose stability not measured."
        }
      ],
      "scopes": {
        "cgm": {
          "covered": false,
          "sentence": "No glucose sensor is connected, so there is no glycemic reading."
        },
        "daily": {
          "covered": true,
          "as_of": "2026-10-01",
          "focus": "anabolic",
          "challenge": {
            "started_on": "2026-09-02",
            "week_index": 4,
            "weeks": 12
          },
          "logging": "every-day",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 55.0,
              "band": "drifting",
              "as_of": "2026-10-01"
            },
            "anabolic": {
              "covered": true,
              "score": 0.0,
              "band": "off-track",
              "as_of": "2026-10-01"
            },
            "glycemic": {
              "covered": false
            }
          },
          "uncovered": [
            "glycemic"
          ],
          "days": [
            {
              "date": "2026-09-02",
              "synced": true,
              "bands": {
                "recovery": "on-track"
              }
            },
            {
              "date": "2026-09-03",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-04",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-05",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-06",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-07",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-08",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-09",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-10",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-11",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-12",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-13",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-14",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-15",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-16",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-17",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-18",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-19",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-20",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-21",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-22",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-23",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-24",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-25",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-26",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-27",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-28",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-29",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-30",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-10-01",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "off-track"
              }
            }
          ],
          "sentence": "Weight is coming down quickly and a meaningful share of it is lean mass. Every logged session is cardio, so resistance training is the lever."
        },
        "labs": {
          "covered": false,
          "sentence": "No laboratory results exist for this persona."
        },
        "body_composition": {
          "covered": true,
          "status": "tracking",
          "retention_band": "watch",
          "weight_direction": "down",
          "lean_direction": "down",
          "lean_source": "measured",
          "first_day": "2026-09-02",
          "last_day": "2026-10-01",
          "sentence": "A meaningful share of the weight coming off is lean mass. Retention reads watch."
        },
        "recovery": {
          "covered": true,
          "pillar": "recovery",
          "score": 55.0,
          "band": "drifting",
          "as_of": "2026-10-01",
          "weekly": [
            {
              "week_index": 0,
              "first_day": "2026-09-02",
              "last_day": "2026-09-08",
              "covered": true,
              "score": 73.0,
              "band": "on-track",
              "as_of": "2026-09-08",
              "direction": "first-reading"
            },
            {
              "week_index": 1,
              "first_day": "2026-09-09",
              "last_day": "2026-09-15",
              "covered": true,
              "score": 67.0,
              "band": "drifting",
              "as_of": "2026-09-15",
              "direction": "declining"
            },
            {
              "week_index": 2,
              "first_day": "2026-09-16",
              "last_day": "2026-09-22",
              "covered": true,
              "score": 66.0,
              "band": "drifting",
              "as_of": "2026-09-22",
              "direction": "steady"
            },
            {
              "week_index": 3,
              "first_day": "2026-09-23",
              "last_day": "2026-09-29",
              "covered": true,
              "score": 54.0,
              "band": "drifting",
              "as_of": "2026-09-29",
              "direction": "declining"
            },
            {
              "week_index": 4,
              "first_day": "2026-09-30",
              "last_day": "2026-10-01",
              "covered": true,
              "score": 55.0,
              "band": "drifting",
              "as_of": "2026-10-01",
              "direction": "steady"
            }
          ],
          "sentence": "Recovery is drifting: overnight recovery signals have slipped below this persona's own baseline.",
          "sleep_label": "adequate"
        },
        "activity": {
          "covered": true,
          "pillar": "anabolic",
          "score": 0.0,
          "band": "off-track",
          "as_of": "2026-10-01",
          "weekly": [
            {
              "week_index": 0,
              "first_day": "2026-09-02",
              "last_day": "2026-09-08",
              "covered": true,
              "score": 0.0,
              "band": "off-track",
              "as_of": "2026-09-08",
              "direction": "first-reading"
            },
            {
              "week_index": 1,
              "first_day": "2026-09-09",
              "last_day": "2026-09-15",
              "covered": true,
              "score": 0.0,
              "band": "off-track",
              "as_of": "2026-09-15",
              "direction": "steady"
            },
            {
              "week_index": 2,
              "first_day": "2026-09-16",
              "last_day": "2026-09-22",
              "covered": true,
              "score": 0.0,
              "band": "off-track",
              "as_of": "2026-09-22",
              "direction": "steady"
            },
            {
              "week_index": 3,
              "first_day": "2026-09-23",
              "last_day": "2026-09-29",
              "covered": true,
              "score": 0.0,
              "band": "off-track",
              "as_of": "2026-09-29",
              "direction": "steady"
            },
            {
              "week_index": 4,
              "first_day": "2026-09-30",
              "last_day": "2026-10-01",
              "covered": true,
              "score": 0.0,
              "band": "off-track",
              "as_of": "2026-10-01",
              "direction": "steady"
            }
          ],
          "sentence": "Muscle stimulus is off track: sessions are logged, and none of them is resistance work.",
          "training_modality": "no-resistance",
          "movement_band": "good"
        },
        "insights": {
          "covered": true,
          "latest": [
            {
              "family": "activity",
              "kind": "activity.adherence",
              "generated_at": "2026-10-01T20:00:00Z",
              "label": "good"
            },
            {
              "family": "recovery",
              "kind": "recovery.state_label",
              "generated_at": "2026-10-01T20:00:00Z",
              "label": "adequate"
            },
            {
              "family": "sleep",
              "kind": "sleep.state_label",
              "generated_at": "2026-10-01T20:00:00Z",
              "label": "adequate"
            },
            {
              "family": "training",
              "kind": "training.adherence",
              "generated_at": "2026-10-01T20:00:00Z",
              "label": "low"
            }
          ],
          "sentence": "The newest derived insight per family: activity, recovery, sleep, training. Each carries a categorical label, never a reading."
        }
      }
    },
    "p3-under-recovered": {
      "persona_id": "p3-under-recovered",
      "display_name": "Under-Recovered Athlete",
      "synthetic": true,
      "window": {
        "first_day": "2026-09-02",
        "last_day": "2026-10-01"
      },
      "focus": "recovery",
      "headline": "Training is frequent and consistent, but sleep is short and recovery has collapsed. Recovery is the lever, not more training.",
      "weeks": [
        {
          "week_index": 0,
          "first_day": "2026-09-02",
          "last_day": "2026-09-08",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 51.0,
              "band": "drifting",
              "as_of": "2026-09-08",
              "direction": "first-reading"
            },
            "anabolic": {
              "covered": true,
              "score": 67.0,
              "band": "drifting",
              "as_of": "2026-09-08",
              "direction": "first-reading"
            },
            "glycemic": {
              "covered": false
            }
          },
          "sentence": "The first week: recovery drifting, muscle stimulus drifting, glucose stability not measured."
        },
        {
          "week_index": 1,
          "first_day": "2026-09-09",
          "last_day": "2026-09-15",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 5.0,
              "band": "off-track",
              "as_of": "2026-09-15",
              "direction": "declining"
            },
            "anabolic": {
              "covered": true,
              "score": 100.0,
              "band": "on-track",
              "as_of": "2026-09-15",
              "direction": "improving"
            },
            "glycemic": {
              "covered": false
            }
          },
          "sentence": "The second week: recovery off track, muscle stimulus on track, glucose stability not measured."
        },
        {
          "week_index": 2,
          "first_day": "2026-09-16",
          "last_day": "2026-09-22",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 0.0,
              "band": "off-track",
              "as_of": "2026-09-22",
              "direction": "declining"
            },
            "anabolic": {
              "covered": true,
              "score": 100.0,
              "band": "on-track",
              "as_of": "2026-09-22",
              "direction": "steady"
            },
            "glycemic": {
              "covered": false
            }
          },
          "sentence": "The third week: recovery off track, muscle stimulus on track, glucose stability not measured."
        },
        {
          "week_index": 3,
          "first_day": "2026-09-23",
          "last_day": "2026-09-29",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 0.0,
              "band": "off-track",
              "as_of": "2026-09-29",
              "direction": "steady"
            },
            "anabolic": {
              "covered": true,
              "score": 100.0,
              "band": "on-track",
              "as_of": "2026-09-29",
              "direction": "steady"
            },
            "glycemic": {
              "covered": false
            }
          },
          "sentence": "The fourth week: recovery off track, muscle stimulus on track, glucose stability not measured."
        },
        {
          "week_index": 4,
          "first_day": "2026-09-30",
          "last_day": "2026-10-01",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 0.0,
              "band": "off-track",
              "as_of": "2026-10-01",
              "direction": "steady"
            },
            "anabolic": {
              "covered": true,
              "score": 100.0,
              "band": "on-track",
              "as_of": "2026-10-01",
              "direction": "steady"
            },
            "glycemic": {
              "covered": false
            }
          },
          "sentence": "The fifth week: recovery off track, muscle stimulus on track, glucose stability not measured."
        }
      ],
      "scopes": {
        "cgm": {
          "covered": false,
          "sentence": "No glucose sensor is connected, so there is no glycemic reading."
        },
        "daily": {
          "covered": true,
          "as_of": "2026-10-01",
          "focus": "recovery",
          "challenge": {
            "started_on": "2026-09-02",
            "week_index": 4,
            "weeks": 12
          },
          "logging": "every-day",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 0.0,
              "band": "off-track",
              "as_of": "2026-10-01"
            },
            "anabolic": {
              "covered": true,
              "score": 100.0,
              "band": "on-track",
              "as_of": "2026-10-01"
            },
            "glycemic": {
              "covered": false
            }
          },
          "uncovered": [
            "glycemic"
          ],
          "days": [
            {
              "date": "2026-09-02",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-03",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-04",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-05",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "drifting"
              }
            },
            {
              "date": "2026-09-06",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "drifting"
              }
            },
            {
              "date": "2026-09-07",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "drifting"
              }
            },
            {
              "date": "2026-09-08",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "drifting"
              }
            },
            {
              "date": "2026-09-09",
              "synced": true,
              "bands": {
                "recovery": "off-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-10",
              "synced": true,
              "bands": {
                "recovery": "off-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-11",
              "synced": true,
              "bands": {
                "recovery": "off-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-12",
              "synced": true,
              "bands": {
                "recovery": "off-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-13",
              "synced": true,
              "bands": {
                "recovery": "off-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-14",
              "synced": true,
              "bands": {
                "recovery": "off-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-15",
              "synced": true,
              "bands": {
                "recovery": "off-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-16",
              "synced": true,
              "bands": {
                "recovery": "off-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-17",
              "synced": true,
              "bands": {
                "recovery": "off-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-18",
              "synced": true,
              "bands": {
                "recovery": "off-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-19",
              "synced": true,
              "bands": {
                "recovery": "off-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-20",
              "synced": true,
              "bands": {
                "recovery": "off-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-21",
              "synced": true,
              "bands": {
                "recovery": "off-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-22",
              "synced": true,
              "bands": {
                "recovery": "off-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-23",
              "synced": true,
              "bands": {
                "recovery": "off-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-24",
              "synced": true,
              "bands": {
                "recovery": "off-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-25",
              "synced": true,
              "bands": {
                "recovery": "off-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-26",
              "synced": true,
              "bands": {
                "recovery": "off-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-27",
              "synced": true,
              "bands": {
                "recovery": "off-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-28",
              "synced": true,
              "bands": {
                "recovery": "off-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-29",
              "synced": true,
              "bands": {
                "recovery": "off-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-09-30",
              "synced": true,
              "bands": {
                "recovery": "off-track",
                "anabolic": "on-track"
              }
            },
            {
              "date": "2026-10-01",
              "synced": true,
              "bands": {
                "recovery": "off-track",
                "anabolic": "on-track"
              }
            }
          ],
          "sentence": "Training is frequent and consistent, but sleep is short and recovery has collapsed. Recovery is the lever, not more training."
        },
        "labs": {
          "covered": false,
          "sentence": "No laboratory results exist for this persona."
        },
        "body_composition": {
          "covered": true,
          "status": "no_loss",
          "retention_band": null,
          "weight_direction": "flat",
          "lean_direction": "down",
          "lean_source": "measured",
          "first_day": "2026-09-02",
          "last_day": "2026-10-01",
          "sentence": "Weight is flat, so there is no loss to apportion and no retention band. Lean mass is trending down."
        },
        "recovery": {
          "covered": true,
          "pillar": "recovery",
          "score": 0.0,
          "band": "off-track",
          "as_of": "2026-10-01",
          "weekly": [
            {
              "week_index": 0,
              "first_day": "2026-09-02",
              "last_day": "2026-09-08",
              "covered": true,
              "score": 51.0,
              "band": "drifting",
              "as_of": "2026-09-08",
              "direction": "first-reading"
            },
            {
              "week_index": 1,
              "first_day": "2026-09-09",
              "last_day": "2026-09-15",
              "covered": true,
              "score": 5.0,
              "band": "off-track",
              "as_of": "2026-09-15",
              "direction": "declining"
            },
            {
              "week_index": 2,
              "first_day": "2026-09-16",
              "last_day": "2026-09-22",
              "covered": true,
              "score": 0.0,
              "band": "off-track",
              "as_of": "2026-09-22",
              "direction": "declining"
            },
            {
              "week_index": 3,
              "first_day": "2026-09-23",
              "last_day": "2026-09-29",
              "covered": true,
              "score": 0.0,
              "band": "off-track",
              "as_of": "2026-09-29",
              "direction": "steady"
            },
            {
              "week_index": 4,
              "first_day": "2026-09-30",
              "last_day": "2026-10-01",
              "covered": true,
              "score": 0.0,
              "band": "off-track",
              "as_of": "2026-10-01",
              "direction": "steady"
            }
          ],
          "sentence": "Recovery is off track: sleep is short and overnight recovery sits well below this persona's own baseline.",
          "sleep_label": "under-rested"
        },
        "activity": {
          "covered": true,
          "pillar": "anabolic",
          "score": 100.0,
          "band": "on-track",
          "as_of": "2026-10-01",
          "weekly": [
            {
              "week_index": 0,
              "first_day": "2026-09-02",
              "last_day": "2026-09-08",
              "covered": true,
              "score": 67.0,
              "band": "drifting",
              "as_of": "2026-09-08",
              "direction": "first-reading"
            },
            {
              "week_index": 1,
              "first_day": "2026-09-09",
              "last_day": "2026-09-15",
              "covered": true,
              "score": 100.0,
              "band": "on-track",
              "as_of": "2026-09-15",
              "direction": "improving"
            },
            {
              "week_index": 2,
              "first_day": "2026-09-16",
              "last_day": "2026-09-22",
              "covered": true,
              "score": 100.0,
              "band": "on-track",
              "as_of": "2026-09-22",
              "direction": "steady"
            },
            {
              "week_index": 3,
              "first_day": "2026-09-23",
              "last_day": "2026-09-29",
              "covered": true,
              "score": 100.0,
              "band": "on-track",
              "as_of": "2026-09-29",
              "direction": "steady"
            },
            {
              "week_index": 4,
              "first_day": "2026-09-30",
              "last_day": "2026-10-01",
              "covered": true,
              "score": 100.0,
              "band": "on-track",
              "as_of": "2026-10-01",
              "direction": "steady"
            }
          ],
          "sentence": "Muscle stimulus is on track: resistance sessions are landing at the weekly target.",
          "training_modality": "with-weights",
          "movement_band": "good"
        },
        "insights": {
          "covered": true,
          "latest": [
            {
              "family": "activity",
              "kind": "activity.adherence",
              "generated_at": "2026-10-01T20:00:00Z",
              "label": "good"
            },
            {
              "family": "recovery",
              "kind": "recovery.state_label",
              "generated_at": "2026-10-01T20:00:00Z",
              "label": "low"
            },
            {
              "family": "sleep",
              "kind": "sleep.state_label",
              "generated_at": "2026-10-01T20:00:00Z",
              "label": "under-rested"
            },
            {
              "family": "training",
              "kind": "training.adherence",
              "generated_at": "2026-10-01T20:00:00Z",
              "label": "good"
            }
          ],
          "sentence": "The newest derived insight per family: activity, recovery, sleep, training. Each carries a categorical label, never a reading."
        }
      }
    },
    "p4-sparse-returner": {
      "persona_id": "p4-sparse-returner",
      "display_name": "Sparse Returner",
      "synthetic": true,
      "window": {
        "first_day": "2026-09-02",
        "last_day": "2026-10-01"
      },
      "focus": "coverage",
      "headline": "Data arrived, stopped for a long stretch, then resumed. There are no readings for the quiet stretch, so anything said about it would be a guess.",
      "weeks": [
        {
          "week_index": 0,
          "first_day": "2026-09-02",
          "last_day": "2026-09-08",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 80.0,
              "band": "on-track",
              "as_of": "2026-09-08",
              "direction": "first-reading"
            },
            "anabolic": {
              "covered": true,
              "score": 33.0,
              "band": "off-track",
              "as_of": "2026-09-08",
              "direction": "first-reading"
            },
            "glycemic": {
              "covered": false
            }
          },
          "sentence": "The first week: recovery on track, muscle stimulus off track, glucose stability not measured."
        },
        {
          "week_index": 1,
          "first_day": "2026-09-09",
          "last_day": "2026-09-15",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 80.0,
              "band": "on-track",
              "as_of": "2026-09-09",
              "direction": "steady"
            },
            "anabolic": {
              "covered": true,
              "score": 50.0,
              "band": "drifting",
              "as_of": "2026-09-09",
              "direction": "improving"
            },
            "glycemic": {
              "covered": false
            }
          },
          "sentence": "The second week: recovery on track, muscle stimulus drifting, glucose stability not measured."
        },
        {
          "week_index": 2,
          "first_day": "2026-09-16",
          "last_day": "2026-09-22",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 80.0,
              "band": "on-track",
              "as_of": "2026-09-09",
              "direction": "steady"
            },
            "anabolic": {
              "covered": true,
              "score": 50.0,
              "band": "drifting",
              "as_of": "2026-09-09",
              "direction": "steady"
            },
            "glycemic": {
              "covered": false
            }
          },
          "sentence": "The third week: recovery on track, muscle stimulus drifting, glucose stability not measured."
        },
        {
          "week_index": 3,
          "first_day": "2026-09-23",
          "last_day": "2026-09-29",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 78.0,
              "band": "on-track",
              "as_of": "2026-09-29",
              "direction": "steady"
            },
            "anabolic": {
              "covered": true,
              "score": 17.0,
              "band": "off-track",
              "as_of": "2026-09-29",
              "direction": "declining"
            },
            "glycemic": {
              "covered": false
            }
          },
          "sentence": "The fourth week: recovery on track, muscle stimulus off track, glucose stability not measured."
        },
        {
          "week_index": 4,
          "first_day": "2026-09-30",
          "last_day": "2026-10-01",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 78.0,
              "band": "on-track",
              "as_of": "2026-10-01",
              "direction": "steady"
            },
            "anabolic": {
              "covered": true,
              "score": 33.0,
              "band": "off-track",
              "as_of": "2026-10-01",
              "direction": "improving"
            },
            "glycemic": {
              "covered": false
            }
          },
          "sentence": "The fifth week: recovery on track, muscle stimulus off track, glucose stability not measured."
        }
      ],
      "scopes": {
        "cgm": {
          "covered": false,
          "sentence": "No glucose sensor is connected, so there is no glycemic reading."
        },
        "daily": {
          "covered": true,
          "as_of": "2026-10-01",
          "focus": "coverage",
          "challenge": {
            "started_on": "2026-09-02",
            "week_index": 4,
            "weeks": 12
          },
          "logging": "quiet-stretch",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 78.0,
              "band": "on-track",
              "as_of": "2026-10-01"
            },
            "anabolic": {
              "covered": true,
              "score": 33.0,
              "band": "off-track",
              "as_of": "2026-10-01"
            },
            "glycemic": {
              "covered": false
            }
          },
          "uncovered": [
            "glycemic"
          ],
          "days": [
            {
              "date": "2026-09-02",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-03",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-04",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-05",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-06",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-07",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-08",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-09",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "drifting"
              }
            },
            {
              "date": "2026-09-10",
              "synced": false,
              "bands": {
                "recovery": "on-track",
                "anabolic": "drifting"
              }
            },
            {
              "date": "2026-09-11",
              "synced": false,
              "bands": {
                "recovery": "on-track",
                "anabolic": "drifting"
              }
            },
            {
              "date": "2026-09-12",
              "synced": false,
              "bands": {
                "recovery": "on-track",
                "anabolic": "drifting"
              }
            },
            {
              "date": "2026-09-13",
              "synced": false,
              "bands": {
                "recovery": "on-track",
                "anabolic": "drifting"
              }
            },
            {
              "date": "2026-09-14",
              "synced": false,
              "bands": {
                "recovery": "on-track",
                "anabolic": "drifting"
              }
            },
            {
              "date": "2026-09-15",
              "synced": false,
              "bands": {
                "recovery": "on-track",
                "anabolic": "drifting"
              }
            },
            {
              "date": "2026-09-16",
              "synced": false,
              "bands": {
                "recovery": "on-track",
                "anabolic": "drifting"
              }
            },
            {
              "date": "2026-09-17",
              "synced": false,
              "bands": {
                "recovery": "on-track",
                "anabolic": "drifting"
              }
            },
            {
              "date": "2026-09-18",
              "synced": false,
              "bands": {
                "recovery": "on-track",
                "anabolic": "drifting"
              }
            },
            {
              "date": "2026-09-19",
              "synced": false,
              "bands": {
                "recovery": "on-track",
                "anabolic": "drifting"
              }
            },
            {
              "date": "2026-09-20",
              "synced": false,
              "bands": {
                "recovery": "on-track",
                "anabolic": "drifting"
              }
            },
            {
              "date": "2026-09-21",
              "synced": false,
              "bands": {
                "recovery": "on-track",
                "anabolic": "drifting"
              }
            },
            {
              "date": "2026-09-22",
              "synced": false,
              "bands": {
                "recovery": "on-track",
                "anabolic": "drifting"
              }
            },
            {
              "date": "2026-09-23",
              "synced": false,
              "bands": {
                "recovery": "on-track",
                "anabolic": "drifting"
              }
            },
            {
              "date": "2026-09-24",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-25",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-26",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-27",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-28",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-29",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-09-30",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            },
            {
              "date": "2026-10-01",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track"
              }
            }
          ],
          "sentence": "Data arrived, stopped for a long stretch, then resumed. There are no readings for the quiet stretch, so anything said about it would be a guess."
        },
        "labs": {
          "covered": false,
          "sentence": "No laboratory results exist for this persona."
        },
        "body_composition": {
          "covered": true,
          "status": "tracking",
          "retention_band": "good",
          "weight_direction": "down",
          "lean_direction": "flat",
          "lean_source": "measured",
          "first_day": "2026-09-02",
          "last_day": "2026-10-01",
          "sentence": "Most of the weight coming off is not lean mass. Retention reads good."
        },
        "recovery": {
          "covered": true,
          "pillar": "recovery",
          "score": 78.0,
          "band": "on-track",
          "as_of": "2026-10-01",
          "weekly": [
            {
              "week_index": 0,
              "first_day": "2026-09-02",
              "last_day": "2026-09-08",
              "covered": true,
              "score": 80.0,
              "band": "on-track",
              "as_of": "2026-09-08",
              "direction": "first-reading"
            },
            {
              "week_index": 1,
              "first_day": "2026-09-09",
              "last_day": "2026-09-15",
              "covered": true,
              "score": 80.0,
              "band": "on-track",
              "as_of": "2026-09-09",
              "direction": "steady"
            },
            {
              "week_index": 2,
              "first_day": "2026-09-16",
              "last_day": "2026-09-22",
              "covered": true,
              "score": 80.0,
              "band": "on-track",
              "as_of": "2026-09-09",
              "direction": "steady"
            },
            {
              "week_index": 3,
              "first_day": "2026-09-23",
              "last_day": "2026-09-29",
              "covered": true,
              "score": 78.0,
              "band": "on-track",
              "as_of": "2026-09-29",
              "direction": "steady"
            },
            {
              "week_index": 4,
              "first_day": "2026-09-30",
              "last_day": "2026-10-01",
              "covered": true,
              "score": 78.0,
              "band": "on-track",
              "as_of": "2026-10-01",
              "direction": "steady"
            }
          ],
          "sentence": "Recovery is on track: sleep and overnight recovery signals are holding.",
          "sleep_label": "adequate"
        },
        "activity": {
          "covered": true,
          "pillar": "anabolic",
          "score": 33.0,
          "band": "off-track",
          "as_of": "2026-10-01",
          "weekly": [
            {
              "week_index": 0,
              "first_day": "2026-09-02",
              "last_day": "2026-09-08",
              "covered": true,
              "score": 33.0,
              "band": "off-track",
              "as_of": "2026-09-08",
              "direction": "first-reading"
            },
            {
              "week_index": 1,
              "first_day": "2026-09-09",
              "last_day": "2026-09-15",
              "covered": true,
              "score": 50.0,
              "band": "drifting",
              "as_of": "2026-09-09",
              "direction": "improving"
            },
            {
              "week_index": 2,
              "first_day": "2026-09-16",
              "last_day": "2026-09-22",
              "covered": true,
              "score": 50.0,
              "band": "drifting",
              "as_of": "2026-09-09",
              "direction": "steady"
            },
            {
              "week_index": 3,
              "first_day": "2026-09-23",
              "last_day": "2026-09-29",
              "covered": true,
              "score": 17.0,
              "band": "off-track",
              "as_of": "2026-09-29",
              "direction": "declining"
            },
            {
              "week_index": 4,
              "first_day": "2026-09-30",
              "last_day": "2026-10-01",
              "covered": true,
              "score": 33.0,
              "band": "off-track",
              "as_of": "2026-10-01",
              "direction": "improving"
            }
          ],
          "sentence": "Muscle stimulus is off track: resistance sessions are well below the weekly target.",
          "training_modality": "with-weights",
          "movement_band": "good"
        },
        "insights": {
          "covered": true,
          "latest": [
            {
              "family": "activity",
              "kind": "activity.adherence",
              "generated_at": "2026-10-01T20:00:00Z",
              "label": "good"
            },
            {
              "family": "recovery",
              "kind": "recovery.state_label",
              "generated_at": "2026-10-01T20:00:00Z",
              "label": "good"
            },
            {
              "family": "sleep",
              "kind": "sleep.state_label",
              "generated_at": "2026-10-01T20:00:00Z",
              "label": "adequate"
            },
            {
              "family": "training",
              "kind": "training.adherence",
              "generated_at": "2026-10-01T20:00:00Z",
              "label": "low"
            }
          ],
          "sentence": "The newest derived insight per family: activity, recovery, sleep, training. Each carries a categorical label, never a reading."
        }
      }
    },
    "p5-glucose-anomaly": {
      "persona_id": "p5-glucose-anomaly",
      "display_name": "Glucose Anomaly",
      "synthetic": true,
      "window": {
        "first_day": "2026-09-02",
        "last_day": "2026-10-01"
      },
      "focus": "glycemic",
      "headline": "Everything else is flat while glucose stability falls through the month. The glycemic signal is the one thing that moved.",
      "weeks": [
        {
          "week_index": 0,
          "first_day": "2026-09-02",
          "last_day": "2026-09-08",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 70.0,
              "band": "on-track",
              "as_of": "2026-09-08",
              "direction": "first-reading"
            },
            "anabolic": {
              "covered": true,
              "score": 25.0,
              "band": "off-track",
              "as_of": "2026-09-08",
              "direction": "first-reading"
            },
            "glycemic": {
              "covered": true,
              "score": 100.0,
              "band": "on-track",
              "as_of": "2026-09-08",
              "direction": "first-reading"
            }
          },
          "sentence": "The first week: recovery on track, muscle stimulus off track, glucose stability on track."
        },
        {
          "week_index": 1,
          "first_day": "2026-09-09",
          "last_day": "2026-09-15",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 65.0,
              "band": "drifting",
              "as_of": "2026-09-15",
              "direction": "declining"
            },
            "anabolic": {
              "covered": true,
              "score": 50.0,
              "band": "drifting",
              "as_of": "2026-09-15",
              "direction": "improving"
            },
            "glycemic": {
              "covered": true,
              "score": 100.0,
              "band": "on-track",
              "as_of": "2026-09-15",
              "direction": "steady"
            }
          },
          "sentence": "The second week: recovery drifting, muscle stimulus drifting, glucose stability on track."
        },
        {
          "week_index": 2,
          "first_day": "2026-09-16",
          "last_day": "2026-09-22",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 62.0,
              "band": "drifting",
              "as_of": "2026-09-22",
              "direction": "declining"
            },
            "anabolic": {
              "covered": true,
              "score": 50.0,
              "band": "drifting",
              "as_of": "2026-09-22",
              "direction": "steady"
            },
            "glycemic": {
              "covered": true,
              "score": 74.0,
              "band": "on-track",
              "as_of": "2026-09-22",
              "direction": "declining"
            }
          },
          "sentence": "The third week: recovery drifting, muscle stimulus drifting, glucose stability on track."
        },
        {
          "week_index": 3,
          "first_day": "2026-09-23",
          "last_day": "2026-09-29",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 52.0,
              "band": "drifting",
              "as_of": "2026-09-29",
              "direction": "declining"
            },
            "anabolic": {
              "covered": true,
              "score": 50.0,
              "band": "drifting",
              "as_of": "2026-09-29",
              "direction": "steady"
            },
            "glycemic": {
              "covered": true,
              "score": 51.0,
              "band": "drifting",
              "as_of": "2026-09-29",
              "direction": "declining"
            }
          },
          "sentence": "The fourth week: recovery drifting, muscle stimulus drifting, glucose stability drifting."
        },
        {
          "week_index": 4,
          "first_day": "2026-09-30",
          "last_day": "2026-10-01",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 59.0,
              "band": "drifting",
              "as_of": "2026-10-01",
              "direction": "improving"
            },
            "anabolic": {
              "covered": true,
              "score": 50.0,
              "band": "drifting",
              "as_of": "2026-10-01",
              "direction": "steady"
            },
            "glycemic": {
              "covered": true,
              "score": 47.0,
              "band": "off-track",
              "as_of": "2026-10-01",
              "direction": "declining"
            }
          },
          "sentence": "The fifth week: recovery drifting, muscle stimulus drifting, glucose stability off track."
        }
      ],
      "scopes": {
        "cgm": {
          "covered": true,
          "pillar": "glycemic",
          "score": 47.0,
          "band": "off-track",
          "as_of": "2026-10-01",
          "weekly": [
            {
              "week_index": 0,
              "first_day": "2026-09-02",
              "last_day": "2026-09-08",
              "covered": true,
              "score": 100.0,
              "band": "on-track",
              "as_of": "2026-09-08",
              "direction": "first-reading"
            },
            {
              "week_index": 1,
              "first_day": "2026-09-09",
              "last_day": "2026-09-15",
              "covered": true,
              "score": 100.0,
              "band": "on-track",
              "as_of": "2026-09-15",
              "direction": "steady"
            },
            {
              "week_index": 2,
              "first_day": "2026-09-16",
              "last_day": "2026-09-22",
              "covered": true,
              "score": 74.0,
              "band": "on-track",
              "as_of": "2026-09-22",
              "direction": "declining"
            },
            {
              "week_index": 3,
              "first_day": "2026-09-23",
              "last_day": "2026-09-29",
              "covered": true,
              "score": 51.0,
              "band": "drifting",
              "as_of": "2026-09-29",
              "direction": "declining"
            },
            {
              "week_index": 4,
              "first_day": "2026-09-30",
              "last_day": "2026-10-01",
              "covered": true,
              "score": 47.0,
              "band": "off-track",
              "as_of": "2026-10-01",
              "direction": "declining"
            }
          ],
          "sentence": "Glucose stability is off track: time in range has fallen and an anomaly flag is raised.",
          "anomaly_flag": true
        },
        "daily": {
          "covered": true,
          "as_of": "2026-10-01",
          "focus": "glycemic",
          "challenge": {
            "started_on": "2026-09-02",
            "week_index": 4,
            "weeks": 12
          },
          "logging": "every-day",
          "pillars": {
            "recovery": {
              "covered": true,
              "score": 59.0,
              "band": "drifting",
              "as_of": "2026-10-01"
            },
            "anabolic": {
              "covered": true,
              "score": 50.0,
              "band": "drifting",
              "as_of": "2026-10-01"
            },
            "glycemic": {
              "covered": true,
              "score": 47.0,
              "band": "off-track",
              "as_of": "2026-10-01"
            }
          },
          "uncovered": [],
          "days": [
            {
              "date": "2026-09-02",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "glycemic": "on-track"
              }
            },
            {
              "date": "2026-09-03",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track",
                "glycemic": "on-track"
              }
            },
            {
              "date": "2026-09-04",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track",
                "glycemic": "on-track"
              }
            },
            {
              "date": "2026-09-05",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track",
                "glycemic": "on-track"
              }
            },
            {
              "date": "2026-09-06",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track",
                "glycemic": "on-track"
              }
            },
            {
              "date": "2026-09-07",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track",
                "glycemic": "on-track"
              }
            },
            {
              "date": "2026-09-08",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track",
                "glycemic": "on-track"
              }
            },
            {
              "date": "2026-09-09",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track",
                "glycemic": "on-track"
              }
            },
            {
              "date": "2026-09-10",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track",
                "glycemic": "on-track"
              }
            },
            {
              "date": "2026-09-11",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track",
                "glycemic": "on-track"
              }
            },
            {
              "date": "2026-09-12",
              "synced": true,
              "bands": {
                "recovery": "on-track",
                "anabolic": "off-track",
                "glycemic": "on-track"
              }
            },
            {
              "date": "2026-09-13",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "drifting",
                "glycemic": "on-track"
              }
            },
            {
              "date": "2026-09-14",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "drifting",
                "glycemic": "on-track"
              }
            },
            {
              "date": "2026-09-15",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "drifting",
                "glycemic": "on-track"
              }
            },
            {
              "date": "2026-09-16",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "drifting",
                "glycemic": "on-track"
              }
            },
            {
              "date": "2026-09-17",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "drifting",
                "glycemic": "on-track"
              }
            },
            {
              "date": "2026-09-18",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "drifting",
                "glycemic": "on-track"
              }
            },
            {
              "date": "2026-09-19",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "drifting",
                "glycemic": "on-track"
              }
            },
            {
              "date": "2026-09-20",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "drifting",
                "glycemic": "on-track"
              }
            },
            {
              "date": "2026-09-21",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "drifting",
                "glycemic": "on-track"
              }
            },
            {
              "date": "2026-09-22",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "drifting",
                "glycemic": "on-track"
              }
            },
            {
              "date": "2026-09-23",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "drifting",
                "glycemic": "on-track"
              }
            },
            {
              "date": "2026-09-24",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "drifting",
                "glycemic": "drifting"
              }
            },
            {
              "date": "2026-09-25",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "drifting",
                "glycemic": "drifting"
              }
            },
            {
              "date": "2026-09-26",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "drifting",
                "glycemic": "drifting"
              }
            },
            {
              "date": "2026-09-27",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "drifting",
                "glycemic": "drifting"
              }
            },
            {
              "date": "2026-09-28",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "drifting",
                "glycemic": "drifting"
              }
            },
            {
              "date": "2026-09-29",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "drifting",
                "glycemic": "drifting"
              }
            },
            {
              "date": "2026-09-30",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "drifting",
                "glycemic": "off-track"
              }
            },
            {
              "date": "2026-10-01",
              "synced": true,
              "bands": {
                "recovery": "drifting",
                "anabolic": "drifting",
                "glycemic": "off-track"
              }
            }
          ],
          "sentence": "Everything else is flat while glucose stability falls through the month. The glycemic signal is the one thing that moved."
        },
        "labs": {
          "covered": false,
          "sentence": "No laboratory results exist for this persona."
        },
        "body_composition": {
          "covered": true,
          "status": "tracking",
          "retention_band": "good",
          "weight_direction": "down",
          "lean_direction": "flat",
          "lean_source": "measured",
          "first_day": "2026-09-02",
          "last_day": "2026-10-01",
          "sentence": "Most of the weight coming off is not lean mass. Retention reads good."
        },
        "recovery": {
          "covered": true,
          "pillar": "recovery",
          "score": 59.0,
          "band": "drifting",
          "as_of": "2026-10-01",
          "weekly": [
            {
              "week_index": 0,
              "first_day": "2026-09-02",
              "last_day": "2026-09-08",
              "covered": true,
              "score": 70.0,
              "band": "on-track",
              "as_of": "2026-09-08",
              "direction": "first-reading"
            },
            {
              "week_index": 1,
              "first_day": "2026-09-09",
              "last_day": "2026-09-15",
              "covered": true,
              "score": 65.0,
              "band": "drifting",
              "as_of": "2026-09-15",
              "direction": "declining"
            },
            {
              "week_index": 2,
              "first_day": "2026-09-16",
              "last_day": "2026-09-22",
              "covered": true,
              "score": 62.0,
              "band": "drifting",
              "as_of": "2026-09-22",
              "direction": "declining"
            },
            {
              "week_index": 3,
              "first_day": "2026-09-23",
              "last_day": "2026-09-29",
              "covered": true,
              "score": 52.0,
              "band": "drifting",
              "as_of": "2026-09-29",
              "direction": "declining"
            },
            {
              "week_index": 4,
              "first_day": "2026-09-30",
              "last_day": "2026-10-01",
              "covered": true,
              "score": 59.0,
              "band": "drifting",
              "as_of": "2026-10-01",
              "direction": "improving"
            }
          ],
          "sentence": "Recovery is drifting: overnight recovery signals have slipped below this persona's own baseline.",
          "sleep_label": "adequate"
        },
        "activity": {
          "covered": true,
          "pillar": "anabolic",
          "score": 50.0,
          "band": "drifting",
          "as_of": "2026-10-01",
          "weekly": [
            {
              "week_index": 0,
              "first_day": "2026-09-02",
              "last_day": "2026-09-08",
              "covered": true,
              "score": 25.0,
              "band": "off-track",
              "as_of": "2026-09-08",
              "direction": "first-reading"
            },
            {
              "week_index": 1,
              "first_day": "2026-09-09",
              "last_day": "2026-09-15",
              "covered": true,
              "score": 50.0,
              "band": "drifting",
              "as_of": "2026-09-15",
              "direction": "improving"
            },
            {
              "week_index": 2,
              "first_day": "2026-09-16",
              "last_day": "2026-09-22",
              "covered": true,
              "score": 50.0,
              "band": "drifting",
              "as_of": "2026-09-22",
              "direction": "steady"
            },
            {
              "week_index": 3,
              "first_day": "2026-09-23",
              "last_day": "2026-09-29",
              "covered": true,
              "score": 50.0,
              "band": "drifting",
              "as_of": "2026-09-29",
              "direction": "steady"
            },
            {
              "week_index": 4,
              "first_day": "2026-09-30",
              "last_day": "2026-10-01",
              "covered": true,
              "score": 50.0,
              "band": "drifting",
              "as_of": "2026-10-01",
              "direction": "steady"
            }
          ],
          "sentence": "Muscle stimulus is drifting: some resistance work is logged, below the weekly target.",
          "training_modality": "with-weights",
          "movement_band": "adequate"
        },
        "insights": {
          "covered": true,
          "latest": [
            {
              "family": "activity",
              "kind": "activity.adherence",
              "generated_at": "2026-10-01T20:00:00Z",
              "label": "adequate"
            },
            {
              "family": "glucose",
              "kind": "glucose.anomaly_flag",
              "generated_at": "2026-10-01T20:00:00Z",
              "label": "adequate"
            },
            {
              "family": "recovery",
              "kind": "recovery.state_label",
              "generated_at": "2026-10-01T20:00:00Z",
              "label": "adequate"
            },
            {
              "family": "sleep",
              "kind": "sleep.state_label",
              "generated_at": "2026-10-01T20:00:00Z",
              "label": "adequate"
            },
            {
              "family": "training",
              "kind": "training.adherence",
              "generated_at": "2026-10-01T20:00:00Z",
              "label": "adequate"
            }
          ],
          "sentence": "The newest derived insight per family: activity, glucose, recovery, sleep, training. Each carries a categorical label, never a reading."
        }
      }
    }
  }
};
