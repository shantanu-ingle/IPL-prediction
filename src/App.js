import React, { useState } from 'react';
import axios from 'axios';
import './index.css';

function App() {
  const [prediction, setPrediction] = useState(null);
  const [chatInput, setChatInput] = useState('');
  const [chatResponse, setChatResponse] = useState('');
  const [formData, setFormData] = useState({
    team1_name: "",
    team2_name: "",
    team1_form: "",
    team2_form: "",
    team1_avg_runs_last_3: "",
    team1_avg_wickets_last_3: "",
    team2_avg_runs_last_3: "",
    team2_avg_wickets_last_3: "",
    player_strike_rate: "",
    player_avg_runs_last_3: "",
    dl_applied: "",
    venue: ""
  });
  const [formError, setFormError] = useState('');
  const [loading, setLoading] = useState(false);

  // Valid teams and venues (based on your Django API)
  const validTeams = [
    "Chennai Super Kings", "Deccan Chargers", "Delhi Capitals", "Delhi Daredevils",
    "Gujarat Lions", "Gujarat Titans", "Kings XI Punjab", "Kochi Tuskers Kerala",
    "Kolkata Knight Riders", "Lucknow Super Giants", "Mumbai Indians", "Pune Warriors",
    "Punjab Kings", "Rajasthan Royals", "Rising Pune Supergiant", "Rising Pune Supergiants",
    "Royal Challengers Bangalore", "Sunrisers Hyderabad"
  ];

  const validVenues = [
    "Eden Gardens", "Wankhede Stadium", "M Chinnaswamy Stadium", "Feroz Shah Kotla",
    "Rajiv Gandhi International Stadium", "MA Chidambaram Stadium", "Sawai Mansingh Stadium",
    "Punjab Cricket Association Stadium, Mohali"
  ];

  const handleInputChange = (e) => {
    const { name, value } = e.target;
    setFormData({
      ...formData,
      [name]: name.includes("name") || name === "venue" ? value : value === "" ? "" : parseFloat(value)
    });
    setFormError(''); // Clear error on input change
  };

  const validateForm = () => {
    // Check required fields
    for (const [key, value] of Object.entries(formData)) {
      if (value === "" || value === null) {
        return `Please fill in all fields: ${key} is empty`;
      }
    }

    // Validate team names
    if (!validTeams.includes(formData.team1_name) || !validTeams.includes(formData.team2_name)) {
      return `Invalid team names. Must be one of: ${validTeams.join(", ")}`;
    }

    // Validate venue
    if (!validVenues.includes(formData.venue)) {
      return `Invalid venue. Must be one of: ${validVenues.join(", ")}`;
    }

    // Validate numeric fields
    const numericFields = [
      { name: "team1_form", min: 0, max: 1 },
      { name: "team2_form", min: 0, max: 1 },
      { name: "team1_avg_runs_last_3", min: 0, max: 300 },
      { name: "team1_avg_wickets_last_3", min: 0, max: 10 },
      { name: "team2_avg_runs_last_3", min: 0, max: 300 },
      { name: "team2_avg_wickets_last_3", min: 0, max: 10 },
      { name: "player_strike_rate", min: 0, max: 300 },
      { name: "player_avg_runs_last_3", min: 0, max: 200 },
      { name: "dl_applied", min: 0, max: 1 }
    ];

    for (const field of numericFields) {
      const value = formData[field.name];
      if (isNaN(value) || value < field.min || value > field.max) {
        return `${field.name} must be a number between ${field.min} and ${field.max}`;
      }
    }

    return null; // No errors
  };

  const fetchPrediction = async () => {
    const error = validateForm();
    if (error) {
      setFormError(error);
      return;
    }

    setLoading(true);
    try {
      const response = await axios.post('http://localhost:8000/api/predict/', formData);
      setPrediction(response.data);
      setFormError('');
    } catch (error) {
      console.error('Error fetching prediction:', error);
      setFormError('Failed to fetch prediction. Ensure the Django server is running.');
    } finally {
      setLoading(false);
    }
  };

  const handleChatSubmit = () => {
    const input = chatInput.toLowerCase();
    if (!prediction) {
      setChatResponse('Please fetch a prediction first.');
      setChatInput('');
      return;
    }

    if (input.includes('who will win')) {
      setChatResponse(`The model predicts ${prediction.match_winner.team} will win with ${prediction.match_winner.confidence * 100}% confidence.`);
    } else if (input.includes('how many runs')) {
      if (input.includes(formData.team1_name.toLowerCase())) {
        setChatResponse(`${formData.team1_name} is predicted to score ${prediction[`${formData.team1_name}_runs`]?.predicted_runs.toFixed(0)} runs.`);
      } else if (input.includes(formData.team2_name.toLowerCase())) {
        setChatResponse(`${formData.team2_name} is predicted to score ${prediction[`${formData.team2_name}_runs`]?.predicted_runs.toFixed(0)} runs.`);
      } else if (input.includes('player')) {
        setChatResponse(`The player is predicted to score ${prediction.player_runs.predicted_runs.toFixed(0)} runs.`);
      } else {
        setChatResponse('Please specify a team or player (e.g., "How many runs for Chennai Super Kings?" or "How many runs for player?").');
      }
    } else {
      setChatResponse('I can answer questions about predictions. Try asking "Who will win?" or "How many runs for Chennai Super Kings?"');
    }
    setChatInput('');
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-purple-900 to-blue-900 text-white p-4">
      <header className="bg-purple-800 p-4 rounded-lg shadow-lg mb-6 header-banner">
        <h1 className="text-4xl font-bold text-center text-yellow-400">IPL Prediction Hub</h1>
      </header>
      <div className="max-w-4xl mx-auto bg-white/10 backdrop-blur-md p-6 rounded-lg shadow-lg border border-yellow-400">
        <h2 className="text-2xl font-semibold mb-4 text-yellow-300">Enter Match Details</h2>
        {formError && <p className="text-red-400 mb-4">{formError}</p>}
        {loading && (
          <div className="flex justify-center mb-4">
            <div className="loader ease-linear rounded-full border-4 border-t-4 border-yellow-400 h-12 w-12"></div>
          </div>
        )}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
          <div>
            <label className="block text-sm font-medium text-yellow-200">Team 1 Name</label>
            <select
              name="team1_name"
              value={formData.team1_name}
              onChange={handleInputChange}
              className="w-full p-2 border border-yellow-400 rounded bg-purple-800 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
            >
              <option value="" className="text-gray-400">Select Team 1</option>
              {validTeams.map(team => (
                <option key={team} value={team} className="text-white">{team}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-yellow-200">Team 2 Name</label>
            <select
              name="team2_name"
              value={formData.team2_name}
              onChange={handleInputChange}
              className="w-full p-2 border border-yellow-400 rounded bg-purple-800 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
            >
              <option value="" className="text-gray-400">Select Team 2</option>
              {validTeams.map(team => (
                <option key={team} value={team} className="text-white">{team}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="block text-sm font-medium text-yellow-200">Team 1 Form (0-1)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="1"
              name="team1_form"
              value={formData.team1_form}
              onChange={handleInputChange}
              className="w-full p-2 border border-yellow-400 rounded bg-purple-800 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
              placeholder="e.g., 0.8"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-yellow-200">Team 2 Form (0-1)</label>
            <input
              type="number"
              step="0.1"
              min="0"
              max="1"
              name="team2_form"
              value={formData.team2_form}
              onChange={handleInputChange}
              className="w-full p-2 border border-yellow-400 rounded bg-purple-800 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
              placeholder="e.g., 0.6"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-yellow-200">Team 1 Avg Runs (Last 3)</label>
            <input
              type="number"
              name="team1_avg_runs_last_3"
              value={formData.team1_avg_runs_last_3}
              onChange={handleInputChange}
              className="w-full p-2 border border-yellow-400 rounded bg-purple-800 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
              placeholder="e.g., 160.5"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-yellow-200">Team 1 Avg Wickets (Last 3)</label>
            <input
              type="number"
              name="team1_avg_wickets_last_3"
              value={formData.team1_avg_wickets_last_3}
              onChange={handleInputChange}
              className="w-full p-2 border border-yellow-400 rounded bg-purple-800 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
              placeholder="e.g., 7.0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-yellow-200">Team 2 Avg Runs (Last 3)</label>
            <input
              type="number"
              name="team2_avg_runs_last_3"
              value={formData.team2_avg_runs_last_3}
              onChange={handleInputChange}
              className="w-full p-2 border border-yellow-400 rounded bg-purple-800 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
              placeholder="e.g., 150.0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-yellow-200">Team 2 Avg Wickets (Last 3)</label>
            <input
              type="number"
              name="team2_avg_wickets_last_3"
              value={formData.team2_avg_wickets_last_3}
              onChange={handleInputChange}
              className="w-full p-2 border border-yellow-400 rounded bg-purple-800 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
              placeholder="e.g., 6.5"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-yellow-200">Player Strike Rate</label>
            <input
              type="number"
              name="player_strike_rate"
              value={formData.player_strike_rate}
              onChange={handleInputChange}
              className="w-full p-2 border border-yellow-400 rounded bg-purple-800 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
              placeholder="e.g., 130.0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-yellow-200">Player Avg Runs (Last 3)</label>
            <input
              type="number"
              name="player_avg_runs_last_3"
              value={formData.player_avg_runs_last_3}
              onChange={handleInputChange}
              className="w-full p-2 border border-yellow-400 rounded bg-purple-800 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
              placeholder="e.g., 35.0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-yellow-200">DL Applied (0 or 1)</label>
            <input
              type="number"
              min="0"
              max="1"
              name="dl_applied"
              value={formData.dl_applied}
              onChange={handleInputChange}
              className="w-full p-2 border border-yellow-400 rounded bg-purple-800 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
              placeholder="e.g., 0.0"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-yellow-200">Venue</label>
            <select
              name="venue"
              value={formData.venue}
              onChange={handleInputChange}
              className="w-full p-2 border border-yellow-400 rounded bg-purple-800 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
            >
              <option value="" className="text-gray-400">Select Venue</option>
              {validVenues.map(venue => (
                <option key={venue} value={venue} className="text-white">{venue}</option>
              ))}
            </select>
          </div>
        </div>
        <button
          onClick={fetchPrediction}
          className="bg-yellow-500 text-purple-900 px-4 py-2 rounded hover:bg-yellow-600 mb-4 font-semibold"
        >
          Get Prediction
        </button>
        {prediction && (
          <div className="space-y-4">
            <div className="bg-purple-800 p-4 rounded-lg shadow-md">
              <h2 className="text-xl font-semibold text-yellow-300">Match Winner</h2>
              <p><strong className="text-yellow-200">Team:</strong> {prediction.match_winner.team}</p>
              <p><strong className="text-yellow-200">Confidence:</strong> {(prediction.match_winner.confidence * 100).toFixed(1)}%</p>
              <p><strong className="text-yellow-200">Explanation:</strong> {prediction.match_winner.explanation}</p>
            </div>
            <div className="bg-purple-800 p-4 rounded-lg shadow-md">
              <h2 className="text-xl font-semibold text-yellow-300">{formData.team1_name} Runs</h2>
              <p><strong className="text-yellow-200">Predicted Runs:</strong> {prediction[`${formData.team1_name}_runs`]?.predicted_runs.toFixed(0)}</p>
              <p><strong className="text-yellow-200">Confidence Interval:</strong> [{prediction[`${formData.team1_name}_runs`]?.confidence_interval[0].toFixed(0)}, {prediction[`${formData.team1_name}_runs`]?.confidence_interval[1].toFixed(0)}]</p>
              <p><strong className="text-yellow-200">Explanation:</strong> {prediction[`${formData.team1_name}_runs`]?.explanation}</p>
            </div>
            <div className="bg-purple-800 p-4 rounded-lg shadow-md">
              <h2 className="text-xl font-semibold text-yellow-300">{formData.team2_name} Runs</h2>
              <p><strong className="text-yellow-200">Predicted Runs:</strong> {prediction[`${formData.team2_name}_runs`]?.predicted_runs.toFixed(0)}</p>
              <p><strong className="text-yellow-200">Confidence Interval:</strong> [{prediction[`${formData.team2_name}_runs`]?.confidence_interval[0].toFixed(0)}, {prediction[`${formData.team2_name}_runs`]?.confidence_interval[1].toFixed(0)}]</p>
              <p><strong className="text-yellow-200">Explanation:</strong> {prediction[`${formData.team2_name}_runs`]?.explanation}</p>
            </div>
            <div className="bg-purple-800 p-4 rounded-lg shadow-md">
              <h2 className="text-xl font-semibold text-yellow-300">Player Runs</h2>
              <p><strong className="text-yellow-200">Predicted Runs:</strong> {prediction.player_runs.predicted_runs.toFixed(0)}</p>
              <p><strong className="text-yellow-200">Confidence Interval:</strong> [{prediction.player_runs.confidence_interval[0].toFixed(0)}, {prediction.player_runs.confidence_interval[1].toFixed(0)}]</p>
              <p><strong className="text-yellow-200">Explanation:</strong> {prediction.player_runs.explanation}</p>
              {prediction.player_runs.trend_plot && (
                <div>
                  <h3 className="text-lg font-medium text-yellow-300">Player Trend Plot</h3>
                  <img src={`http://localhost:8000${prediction.player_runs.trend_plot}`} alt="Player Trend" className="w-full max-w-md rounded-lg shadow-md" />
                </div>
              )}
            </div>
          </div>
        )}
        <div className="mt-6">
          <h2 className="text-xl font-semibold text-yellow-300">Chatbot</h2>
          <input
            type="text"
            value={chatInput}
            onChange={(e) => setChatInput(e.target.value)}
            className="w-full p-2 border border-yellow-400 rounded bg-purple-800 text-white focus:outline-none focus:ring-2 focus:ring-yellow-400"
            placeholder="Ask about predictions (e.g., Who will win?)"
          />
          <button
            onClick={handleChatSubmit}
            className="bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600 mt-2 font-semibold"
          >
            Send
          </button>
          {chatResponse && (
            <p className="mt-2"><strong className="text-yellow-200">Chatbot:</strong> {chatResponse}</p>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;

