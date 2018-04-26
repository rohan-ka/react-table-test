import React, { Component } from 'react';
import axios from 'axios';
import { AutoSizer, Grid } from 'react-virtualized';
import './App.css';

const Cell = ({
                columnIndex,
                key,
                rowIndex,
                style,
              }) => {

  if (rowIndex === 0 && columnIndex === 0) {
    return (<div className='grid-cell' key={key} style={{...style, height: style.height * 2}}>
              {`${rowIndex}, ${columnIndex}`}
            </div>);
  }

  if(rowIndex === 1 && columnIndex === 0) {
    return null;
  }

  return (<div className='grid-cell' key={key} style={style}>
            {`${rowIndex}, ${columnIndex}`}
          </div>);
}


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
    const height = window.innerHeight;
    const colCount = 1000,
    rowCount = 1000,
    cellHeight = 50,
    cellWidth = 100,
    tableHeight = height;
    return (
      <div style={{ display: 'flex' }}>
        <div style={{ flex: '1 1 auto' }}>
          <AutoSizer disableHeight>
            {({ width }) => (
              <Grid
                cellRenderer={Cell}
                columnCount={colCount - 1}
                columnHeight={rowCount * cellHeight}
                columnWidth={cellWidth}
                height={tableHeight}
                rowCount={rowCount - 1}
                rowHeight={cellHeight}
                rowWidth={colCount * cellWidth}
                width={width}
              />
            )}
          </AutoSizer>
        </div>
      </div>
    );
  }
}

export default App;
