import React, { Component } from 'react';
import axios from 'axios';
import { AutoSizer, Grid } from 'react-virtualized';
import './App.css';

const Cell = state => ({
                columnIndex,
                key,
                rowIndex,
                style,
              }) => {


  const item = state.data[rowIndex][columnIndex];
  if(!item) {
    return null;
  }

  return (<div className='grid-cell' key={key} style={{...style, height: style.height * item.count}}>
           {item.label}
          </div>);
}

const getChildren = (dimensions, data, level = 0) => {
  if(!data) {
    return null;
  }

  if(level >= dimensions.length) {
    return null;
  }

  return data.reduce((acc, c ) => {
    return [
        ...acc,
        {
          label: c[dimensions[level]],
          childrenCount: c.split? c.split.length : null,
          children: getChildren(dimensions, c.split, level+1)
        }];
  }, []);
}

const getLeafCount = (c) => {
  if(!c.children) {
    return 1;
  }

  return c.children.reduce((a, c) => a + getLeafCount(c), 0);
}

const toArray = (data) => {
 return data.reduce((acc, c) => {

  const count = getLeafCount(c);

  if(!c.children) {
    return [...acc, [{label: c.label, count: 1}]];
  }

  const arr = [[{label: c.label, count }]];
  for(let i=0; i<count; i++) {
    if(!arr[i]) {
      arr[i] = [];
    }
  }
  const children = toArray(c.children);

  children.reduce((acc, children, i) => {
    acc[i] = acc[i].concat(children);
    return acc;
  }, arr);

  return [...acc, ...arr];
 }, []);
}

const flatten = ({result: data, dimensions}) => {

  const x = getChildren(dimensions, data.split)

  return toArray(x).map(x => {
    if(x.length < dimensions.length) {
      return Array(dimensions.length - x.length).fill(null).concat(x);
    }
    return x;
  });
}


class App extends Component {
  state = {
   data: null,
   dimensions: [],
  }

  componentDidMount() {
    axios.get('http://localhost:3002/data')
      .then(x => x.data)
      .then(x => this.setState({dimensions: x.dimensions}) || x)
      .then(flatten)
      .then((data) => this.setState({data}) || data)
  }

  indexGetter = ({startIndex, stopIndex, direction}) => {
    if(direction === 'vertical') {
      let i = startIndex;
      const {data} = this.state;

      if(data && data[i]) {
        for(; i >= 0 && data[i][0] === null; i--);
      }

      return {overscanStartIndex: i >= 0 ? i : 0 , overscanStopIndex: stopIndex};
    }
    return {overscanStartIndex: startIndex, overscanStopIndex: stopIndex};
  }
  render() {

    if(!this.state.data) {
      return 'Loading';
    }

    const height = window.innerHeight;
    const colCount = this.state.dimensions.length,
    rowCount = this.state.data.length,
    cellHeight = 50,
    cellWidth = 100,
    tableHeight = height;
    return (
      <div style={{ display: 'flex' }}>
        <div style={{ flex: '1 1 auto' }}>
          <AutoSizer disableHeight>
            {({ width }) => (
              <Grid
                cellRenderer={Cell(this.state)}
                columnCount={colCount}
                columnHeight={rowCount * cellHeight}
                columnWidth={cellWidth}
                height={tableHeight}
                rowCount={rowCount}
                rowHeight={cellHeight}
                rowWidth={colCount * cellWidth}
                width={width}
                overscanIndicesGetter={this.indexGetter}
              />
            )}
          </AutoSizer>
        </div>
      </div>
    );
  }
}

export default App;
