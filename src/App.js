import React, { Component } from 'react';
import axios from 'axios';
import './App.css';

class App extends Component {
  state = {
   data: null,
  }
  componentDidMount() {
    axios.get('http://localhost:3002/data')
      .then(x => x.data)
      .then((data) => this.setState({data}));
  }

  render() {
    return (
        <pre>
        {JSON.stringify(this.state.data, undefined, 2)}
        </pre>
    );
  }
}

export default App;
