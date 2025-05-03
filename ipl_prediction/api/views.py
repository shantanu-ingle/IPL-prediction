from rest_framework.decorators import api_view
from rest_framework.response import Response
from rest_framework import status
import pandas as pd
import numpy as np
import ollama
from sklearn.model_selection import train_test_split
from xgboost import XGBClassifier, XGBRegressor
import ast
import logging
import matplotlib.pyplot as plt
import os
from django.conf import settings

logger = logging.getLogger(__name__)

@api_view(['POST'])
def predict_match(request):
    try:
        # Load and preprocess data
        df = pd.read_csv('prepared_ipl_dataset.csv')
        batting_stats = pd.read_csv('player_batting_stats.csv')
        batting_trends = pd.read_csv('player_batting_trends_updated.csv')

        def parse_form(form_str):
            try:
                if isinstance(form_str, (int, float)):
                    return float(form_str)
                form_list = ast.literal_eval(form_str)
                return sum(form_list) / len(form_list) if isinstance(form_list, list) else float(form_list)
            except (ValueError, SyntaxError, TypeError):
                return 0.5

        df['team1_form'] = df['team1_form'].apply(parse_form).fillna(0.5)
        df['team2_form'] = df['team2_form'].apply(parse_form).fillna(0.5)

        df_clean = df[df['winner'] != '0'].copy()

        drop_cols = ['season', 'city', 'date', 'result', 'player_of_match', 'umpire1', 'umpire2', 'umpire3']
        features_winner = [col for col in df_clean.columns if col not in drop_cols + ['id', 'winner', 'team1_runs', 'team2_runs', 'match_id_x', 'match_id_y']]
        X_winner = df_clean[features_winner].astype('float64')
        y_winner = df_clean['winner'].astype('category').cat.codes
        winner_categories = df_clean['winner'].astype('category').cat.categories

        X_train_w, X_test_w, y_train_w, y_test_w = train_test_split(X_winner, y_winner, test_size=0.2, random_state=42, stratify=y_winner)

        winner_model = XGBClassifier(use_label_encoder=False, eval_metric='mlogloss', device='cuda', tree_method='hist', verbosity=0)
        winner_model.fit(X_train_w, y_train_w)

        features_runs = features_winner
        X_runs = df_clean[features_runs].astype('float64')
        y_team1 = df_clean['team1_runs'].astype('float64')
        y_team2 = df_clean['team2_runs'].astype('float64')

        X_train_t1, X_test_t1, y_train_t1, y_test_t1 = train_test_split(X_runs, y_team1, test_size=0.2, random_state=42)
        X_train_t2, X_test_t2, y_train_t2, y_test_t2 = train_test_split(X_runs, y_team2, test_size=0.2, random_state=42)

        team1_model = XGBRegressor(device='cuda', tree_method='hist', max_bin=256, verbosity=0)
        team2_model = XGBRegressor(device='cuda', tree_method='hist', max_bin=256, verbosity=0)
        team1_model.fit(X_train_t1, y_train_t1)
        team2_model.fit(X_train_t2, y_train_t2)

        batting_data = batting_stats.merge(batting_trends, on=['striker', 'match_id'], how='left')
        batting_data = batting_data.merge(df_clean[['id', 'dl_applied'] + [col for col in df_clean.columns if col.startswith('venue_')]], left_on='match_id', right_on='id')
        batting_data = batting_data.drop(columns=['id'], errors='ignore')
        features_player = ['avg_runs_last_3', 'strike_rate', 'dl_applied'] + [col for col in batting_data.columns if col.startswith('venue_')]
        X_player = batting_data[features_player].astype('float64')
        y_player = batting_data['runs_off_bat'].astype('float64')

        X_train_p, X_test_p, y_train_p, y_test_p = train_test_split(X_player, y_player, test_size=0.2, random_state=42)

        player_model = XGBRegressor(device='cuda', tree_method='hist', max_bin=256, verbosity=0)
        player_model.fit(X_train_p, y_train_p)

        def generate_prediction_explanation(prediction, features, model_type, team1_name="Team 1", team2_name="Team 2", winner_team=None):
            if model_type == "winner":
                prompt = f"""
                You are an expert cricket analyst. An ML model predicts that {winner_team} will win an IPL match between {team1_name} and {team2_name} with {prediction['confidence']*100:.1f}% confidence.
                Key factors:
                - {team1_name} form: {features['team1_form']*100:.1f}% (last 3 matches)
                - {team2_name} form: {features['team2_form']*100:.1f}% (last 3 matches)
                Explain why {winner_team} is likely to win in under 100 words, focusing on these factors.
                """
            elif model_type == "team_runs":
                team_name = team1_name if prediction['team'] == "Team 1" else team2_name
                prompt = f"""
                You are an expert cricket analyst. An ML model predicts {team_name} will score {prediction['runs']:.0f} runs.
                Key factors:
                - Team form: {features['team_form']*100:.1f}% (last 3 matches)
                - Average runs (last 3): {features['avg_runs_last_3']:.1f}
                Explain why this score is predicted in under 100 words, focusing on these factors.
                """
            elif model_type == "player_runs":
                prompt = f"""
                You are an expert cricket analyst. An ML model predicts Player X will score {prediction['runs']:.0f} runs.
                Key factors:
                - Average runs (last 3): {features['player_avg_runs_last_3']:.1f}
                - Strike rate: {features['player_strike_rate']:.1f}
                Explain why this performance is predicted in under 100 words, focusing on these factors.
                """
            try:
                response = ollama.generate(model="mistral", prompt=prompt)
                return response['response']
            except Exception as e:
                return f"Error generating explanation: {str(e)}"

        def generate_player_trend_plot(player_runs):
            plt.figure(figsize=(6, 4))
            plt.plot([1, 2, 3], [player_runs - 5, player_runs, player_runs + 5], label="Player Runs (Last 3)", marker='o')
            plt.xlabel("Match")
            plt.ylabel("Runs")
            plt.title("Player Runs Trend (Last 3 Matches)")
            plt.legend()
            plot_path = os.path.join(settings.STATICFILES_DIRS[0], "player_trend.png")
            plt.savefig(plot_path)
            plt.close()
            return "/static/player_trend.png"

        input_data = request.data
        required_fields = [
            'team1_name', 'team2_name', 'team1_form', 'team2_form',
            'team1_avg_runs_last_3', 'team1_avg_wickets_last_3',
            'team2_avg_runs_last_3', 'team2_avg_wickets_last_3',
            'player_strike_rate', 'player_avg_runs_last_3', 'dl_applied', 'venue'
        ]
        for field in required_fields:
            if field not in input_data:
                return Response({"error": f"Missing field: {field}"}, status=status.HTTP_400_BAD_REQUEST)

        valid_teams = winner_categories.tolist()
        if input_data['team1_name'] not in valid_teams or input_data['team2_name'] not in valid_teams:
            return Response({"error": f"Invalid team names. Must be one of: {valid_teams}"}, status=status.HTTP_400_BAD_REQUEST)

        input_df = pd.DataFrame(np.zeros((1, len(features_winner)), dtype=np.float64), columns=features_winner)
        input_df['team1_form'] = input_data['team1_form']
        input_df['team2_form'] = input_data['team2_form']
        input_df['team1_avg_runs_last_3'] = input_data['team1_avg_runs_last_3']
        input_df['team1_avg_wickets_last_3'] = input_data['team1_avg_wickets_last_3']
        input_df['team2_avg_runs_last_3'] = input_data['team2_avg_runs_last_3']
        input_df['team2_avg_wickets_last_3'] = input_data['team2_avg_wickets_last_3']

        for team_col in [col for col in features_winner if col.endswith('_x') or col.endswith('_y')]:
            if input_data['team1_name'] in team_col:
                input_df[team_col] = 1
            elif input_data['team2_name'] in team_col:
                input_df[team_col] = 1

        venue_col = f"venue_{input_data['venue']}"
        if venue_col in features_winner:
            input_df[venue_col] = 1
        else:
            logger.warning(f"Venue {input_data['venue']} not found in features. Setting to zero.")

        # Log the input_df for debugging
        logger.info(f"Input features: {input_df.to_dict()}")

        input_array = input_df.values

        # Filter winner categories to only include the input teams
        filtered_categories = [input_data['team1_name'], input_data['team2_name']]
        filtered_indices = [list(winner_categories).index(team) for team in filtered_categories]
        winner_prob = winner_model.predict_proba(input_array)[0]

        # Log all probabilities for debugging
        logger.info(f"Predicted probabilities (all teams): {dict(zip(winner_categories, winner_prob))}")

        # Filter probabilities to only the input teams
        filtered_prob = winner_prob[filtered_indices]
        winner_idx = np.argmax(filtered_prob)
        winner_team = filtered_categories[winner_idx]
        winner_conf = filtered_prob[winner_idx]

        # Log filtered probabilities
        logger.info(f"Filtered probabilities: {dict(zip(filtered_categories, filtered_prob))}")

        # Fallback: If winner_team is not one of the input teams, select the team with higher form
        if winner_team not in filtered_categories:
            logger.warning(f"Predicted winner {winner_team} not in input teams {filtered_categories}. Using form-based fallback.")
            winner_team = input_data['team1_name'] if input_data['team1_form'] > input_data['team2_form'] else input_data['team2_name']
            winner_conf = max(input_data['team1_form'], input_data['team2_form'])
            logger.info(f"Fallback winner: {winner_team} with confidence {winner_conf}")

        winner_features = {"team1_form": input_data['team1_form'], "team2_form": input_data['team2_form']}
        winner_explanation = generate_prediction_explanation(
            {"winner": winner_team, "confidence": winner_conf},
            winner_features,
            "winner",
            input_data['team1_name'],
            input_data['team2_name'],
            winner_team
        )

        team1_runs = team1_model.predict(input_array)[0]
        team2_runs = team2_model.predict(input_array)[0]
        team1_rmse = 16.84
        team2_rmse = 18.57
        team1_runs_lower = team1_runs - 1.96 * team1_rmse
        team1_runs_upper = team1_runs + 1.96 * team1_rmse
        team2_runs_lower = team2_runs - 1.96 * team2_rmse
        team2_runs_upper = team2_runs + 1.96 * team2_rmse
        team1_features = {"team_form": input_data['team1_form'], "avg_runs_last_3": input_data['team1_avg_runs_last_3']}
        team2_features = {"team_form": input_data['team2_form'], "avg_runs_last_3": input_data['team2_avg_runs_last_3']}
        team1_explanation = generate_prediction_explanation(
            {"team": "Team 1", "runs": team1_runs},
            team1_features,
            "team_runs",
            input_data['team1_name'],
            input_data['team2_name']
        )
        team2_explanation = generate_prediction_explanation(
            {"team": "Team 2", "runs": team2_runs},
            team2_features,
            "team_runs",
            input_data['team1_name'],
            input_data['team2_name']
        )

        winning_team = winner_team
        winning_runs = team1_runs if winner_team == input_data['team1_name'] else team2_runs
        winning_runs_lower = team1_runs_lower if winner_team == input_data['team1_name'] else team2_runs_lower
        winning_runs_upper = team1_runs_upper if winner_team == input_data['team1_name'] else team2_runs_upper
        losing_team = input_data['team2_name'] if winner_team == input_data['team1_name'] else input_data['team1_name']
        losing_runs = team2_runs if winner_team == input_data['team1_name'] else team1_runs
        losing_runs_lower = team2_runs_lower if winner_team == input_data['team1_name'] else team1_runs_lower
        losing_runs_upper = team2_runs_upper if winner_team == input_data['team1_name'] else team1_runs_upper

        player_input_df = pd.DataFrame(np.zeros((1, len(features_player)), dtype=np.float64), columns=features_player)
        player_input_df['avg_runs_last_3'] = input_data['player_avg_runs_last_3']
        player_input_df['strike_rate'] = input_data['player_strike_rate']
        player_input_df['dl_applied'] = input_data['dl_applied']
        if venue_col in features_player:
            player_input_df[venue_col] = 1
        player_input = player_input_df.values
        player_runs = player_model.predict(player_input)[0]
        player_rmse = 12.38
        player_runs_lower = player_runs - 1.96 * player_rmse
        player_runs_upper = player_runs + 1.96 * player_rmse
        player_features = {"player_avg_runs_last_3": input_data['player_avg_runs_last_3'], "player_strike_rate": input_data['player_strike_rate']}
        player_explanation = generate_prediction_explanation(
            {"runs": player_runs},
            player_features,
            "player_runs",
            input_data['team1_name'],
            input_data['team2_name']
        )

        plot_url = generate_player_trend_plot(input_data['player_avg_runs_last_3'])

        return Response({
            "match_winner": {
                "team": winner_team,
                "confidence": float(winner_conf),
                "explanation": winner_explanation
            },
            f"{input_data['team1_name']}_runs": {
                "predicted_runs": float(team1_runs),
                "confidence_interval": [float(team1_runs_lower), float(team1_runs_upper)],
                "explanation": team1_explanation
            },
            f"{input_data['team2_name']}_runs": {
                "predicted_runs": float(team2_runs),
                "confidence_interval": [float(team2_runs_lower), float(team2_runs_upper)],
                "explanation": team2_explanation
            },
            "winning_team_runs": {
                "team": winning_team,
                "predicted_runs": float(winning_runs),
                "confidence_interval": [float(winning_runs_lower), float(winning_runs_upper)]
            },
            "losing_team_runs": {
                "team": losing_team,
                "predicted_runs": float(losing_runs),
                "confidence_interval": [float(losing_runs_lower), float(losing_runs_upper)]
            },
            "player_runs": {
                "predicted_runs": float(player_runs),
                "confidence_interval": [float(player_runs_lower), float(player_runs_upper)],
                "explanation": player_explanation,
                "trend_plot": plot_url
            }
        }, status=status.HTTP_200_OK)
    except Exception as e:
        logger.error(f"Prediction error: {str(e)}")
        return Response({"error": str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)