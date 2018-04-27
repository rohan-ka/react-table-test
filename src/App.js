import React, { Component } from 'react';
import axios from 'axios';
import { AutoSizer, Grid, ScrollSync, MultiGrid } from 'react-virtualized';
import * as R from 'ramda';
import './App.css';

window.R = R;

const getChildren = (rows, data, level = 0) => {
  if(!data) {
    return null;
  }

  if(level >= rows.length) {
    return null;
  }

  return data.reduce((acc, c ) => {
    return [
        ...acc,
        {
          label: c[rows[level]],
          childrenCount: c.split? c.split.length : null,
          children: getChildren(rows, c.split, level+1)
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
    return [...acc, [{label: c.label, count: 1, root: true}]];
  }

  const arr = [[{label: c.label, count, root: true }]];
  for(let i=0; i<count; i++) {
    if(!arr[i]) {
      arr[i] = [{label: c.label, count }];
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

const flatten = ({result: data, rows}) => {

  const x = getChildren(rows, data.split);
  return toArray(x).map(x => {
    if(x.length < rows.length) {
      return Array(rows.length - x.length).fill(null).concat(x);
    }
    return x;
  });
}

const parseData = (data, dimensions, metrics, level = 0) => {
  if(level === dimensions.length - 1 ) {
    const currentDimension = dimensions[level];

    return data.reduce((a, c) => {
      a[c[currentDimension]] = R.pick(metrics, c);
      return a;
    }, {});
  }

  return data.reduce((a, c) => {
    const x = parseData(c.split, dimensions, metrics, level + 1);
    a[c[dimensions[level]]] = x;
    a.__totals = R.pick(metrics, c);
    return a;
  }, {});
}

const cellRenderer = ({metrics, rows, data: rowsData, columnMap, parsedData, colsData, columns}) => ({ columnIndex, key, rowIndex, style }) => {
  console.log(rowIndex);
  if(columns.length === 0 && rowIndex === 0) {
    return <div className="grid-cell" key={key} style={style}>{rows.concat(metrics)[columnIndex]}</div>
  }

  const headerRows = (columns.length + (metrics.length > 1 ? 1 : 0)) || 1;

  if(rowIndex < headerRows) {
      if(columnIndex < rows.length && rowIndex === 0) {
        return <div className="grid-cell" key={key} style={{...style, height: style.height * headerRows}}>{rows[columnIndex]}</div>
      }
      if(columnIndex >= rows.length) {
        const item = colsData[columnIndex - rows.length][rowIndex];

        return !item || !item.root
          ? null
          : (
          <div className="grid-cell" key={key} style={{...style, width: style.width * item.count}}>{item.label}</div>
        );
    }
    return null;
  }


  if(columnIndex < rows.length) {
    const item = rowsData[rowIndex - headerRows][columnIndex];

    return !item || !item.root ? null : (<div className='grid-cell' key={key} style={{...style, height: style.height * item.count}}>{item.label}</div>);
  }


  const currentIndex = rowIndex - headerRows;

  const withoutMetrics = R.reject(R.pipe(R.prop('label'), R.contains(R.__, metrics)));

  const path = columns.length === 0
    ? rowsData[currentIndex]
    : rowsData[currentIndex].concat(withoutMetrics(colsData[columnIndex - rows.length]))

  const dimPath = R.pluck('label', path).concat(metrics[(columnIndex - rows.length) % metrics.length]);
  console.log(rowIndex, columnIndex, dimPath);
  const z = R.path(dimPath, parsedData) || null;

  return (<div className='grid-cell' key={key} style={{...style}}>{z}</div>);
}

const addMetricCols = (metrics, colMap) => {

  return colMap.map((x) =>  {
    if(x.children) {
      const children = addMetricCols(metrics, x.children);
      return {...x, count: children.length, children };
    }
    return {
      ...x,
      count: metrics.length,
      children: metrics.map((metric) => ({label: metric, count: 0, children: null}))
    };
  });
}


class App extends Component {
  state = {
   data: null,
   rows: [],
   rawData: null,
   metrics: [],
   columnMap: []
  }

  componentDidMount() {
    axios.get('http://localhost:3002/data')
      .then(x => x.data)
      .then(R.tap(x => this.setState({ rows: x.rows, metrics: x.metrics, rawData: x.result, columnMap: x.colUnique, columns: x.columns })))
      .then(flatten)
      .then((data) => this.setState({data}) || data)
  }

  indexGetter = ({startIndex, stopIndex, direction}) => {
    if(direction === 'vertical') {
      let i = startIndex;
      const {data} = this.state;

      if(data && data[i]) {
        for(; i >= 0 && data[i][0] === null || !data[i][0]['root']; i--);
      }

      return {overscanStartIndex: i >= 0 ? i : 0 , overscanStopIndex: stopIndex};
    }
    return {overscanStartIndex: startIndex, overscanStopIndex: stopIndex};
  }

  render() {

    if(!this.state.data) {
      return 'Loading';
    }

    let {columnMap} = this.state;
    if(this.state.metrics.length > 1) {
      columnMap = addMetricCols(this.state.metrics, columnMap);
    }

    const colsData = toArray(columnMap);
    const parsedData = parseData(this.state.rawData.split, this.state.rows.concat(this.state.columns), this.state.metrics)
    console.log(parsedData);
    const height = window.innerHeight;
    const colCount = this.state.rows.length,

    rowCount = this.state.data.length,
    cellHeight = 50,
    cellWidth = 150,
    tableHeight = height;

    return (
      <MultiGrid
        cellRenderer={cellRenderer({...this.state, colsData, parsedData})}
        columnWidth={cellWidth}
        columnCount={this.state.rows.length + ((colsData.length - 1) )}
        rowCount={this.state.columns.length + this.state.data.length + (this.state.metrics.length > 1 ? 1 : 0)}
        rowHeight={cellHeight}
        height={cellHeight * (this.state.columns.length + this.state.rows.length + (this.state.metrics.length > 1 ? this.state.metrics.length : 0))}
        width={1000}
        height={tableHeight}
        fixedColumnCount={this.state.rows.length}
        fixedRowCount={(this.state.columns.length + (this.state.metrics.length > 1 ? 1 : 0)) || 1 }
        enableFixedRowScroll
        enableFixedColumnScroll
        overscanIndicesGetter={this.indexGetter}
        overscanColumnCount={10}
      />);
  }
}

export default App;
