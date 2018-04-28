import React, { Component } from 'react';
import axios from 'axios';
import { AutoSizer, Grid, ScrollSync, MultiGrid } from 'react-virtualized';
import * as R from 'ramda';
import './App.css';

window.R = R;

const groupChildren = (rows, data) => {
  return (function _r(data, level) {
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
            children: _r(c.split, level+1)
          }];
    }, []);
  })(data, 0);
}

const getLeafCount = (c) =>  !c.children ? 1 : c.children.reduce((a, c) => a + getLeafCount(c), 0);

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

const padNulls = (num) => R.concat(R.repeat(null, num));

const flatten = ({rows, rawData}) => toArray(groupChildren(rows, rawData.split)).map(R.ifElse(
      R.compose(R.gte(rows.length), R.length),
      x => padNulls(rows.length - x.length)(x),
      R.identity()
    ));

const parseData = (dimensions, metrics, data) => {
  return (function _r(data, level) {
    if(level === dimensions.length - 1 ) {
      const currentDimension = dimensions[level];

      return data.reduce((a, c) => {
        a[c[currentDimension]] = R.pick(metrics, c);
        return a;
      }, {});
    }

    return data.reduce((a, c) => {
      const x = _r(c.split, level + 1);
      a[c[dimensions[level]]] = x;
      a.__totals = R.pick(metrics, c);
      return a;
    }, {});
  })(data, 0)
}

const addMetricColumnHeaders = ({ metrics, columnMap }) => {
  return columnMap.map((x) =>  {
    if(x.children) {
      const children = addMetricColumnHeaders({ metrics, columnMap: x.children });
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
    loaded: false,
    rowData: [],
    colsData: [],
    parsedData: [],
    hasColumns: false,
    headerCount: 0,
    rowCount: 0,
    columnCount: 0,

  }

  componentDidMount() {
    axios.get('http://localhost:3002/data')
      .then(x => this.compute(x.data))
  }


  compute = ({ rows ,columns, metrics, colUnique, result: rawData }) => {
    const rowData = flatten({ rawData, rows});
    let columnMap = colUnique;
    if (metrics.length > 1) {
      columnMap = addMetricColumnHeaders({metrics, columnMap});
    }
    const colsData = toArray(columnMap);
    const hasColumns = columns.length > 0;
    const headerCount = hasColumns ? columns.length + Math.sign(metrics.length) : 1;

    this.setState({
      rowData,
      colsData,
      parsedData: parseData(rows.concat(columns), metrics, rawData.split),
      hasColumns,
      headerCount,
      rowCount: headerCount + rowData.length,
      columnCount: rows.length + colsData.length,
      loaded: true,
      rows,
      columns,
      metrics,
    })
  }

  indexGetter = ({startIndex, stopIndex, direction}) => {
    if(direction === 'vertical') {
      let i = startIndex;
      const {rowData: data} = this.state;

      if(data && data[i]) {
        for(; i >= 0 && data[i][0] === null || !data[i][0]['root']; i--);
      }

      return { overscanStartIndex: i >= 0 ? i : 0 , overscanStopIndex: stopIndex };
    }
    return {overscanStartIndex: startIndex, overscanStopIndex: stopIndex};
  }

  renderCell = ({ columnIndex, key, rowIndex, style }) => {
    const {metrics, rows, rowData, colsData, columns, parsedData, headerCount, hasColumns} = this.state;
    const rowOffset = rowIndex - headerCount;
    const columnOffset = columnIndex - rows.length;

    if(!hasColumns && rowIndex === 0) {
      return <div className="grid-cell" key={key} style={style}>{rows.concat(metrics)[columnIndex]}</div>
    }

    if(rowOffset < 0) {
        if(columnOffset < 0 && rowIndex === 0) {
          return <div className="grid-cell" key={key} style={{...style, height: style.height * headerCount}}>{rows[columnIndex]}</div>
        }
        if(columnOffset >= 0) {
          const item = colsData[columnIndex - rows.length][rowIndex];

          return !item || !item.root
            ? null
            : (
            <div className="grid-cell" key={key} style={{...style, width: style.width * item.count}}>{item.label}</div>
          );
      }
      return null;
    }


    if(columnOffset < 0) {
      const item = rowData[rowOffset][columnIndex];

      return !item || !item.root ? null : (<div className='grid-cell' key={key} style={{...style, height: style.height * item.count}}>{item.label}</div>);
    }

    const withoutMetrics = R.reject(
      R.pipe(
        R.prop('label'),
        R.contains(R.__, metrics)
      )
    );

    const value = R.compose(
      R.path(R.__, parsedData),
      R.append(metrics[columnOffset % metrics.length]),
      R.pluck('label'),
      R.when(
        R.always(hasColumns),
        R.concat(R.__, withoutMetrics(colsData[columnOffset]))
      )
    );

    return (<div className='grid-cell' key={key} style={{...style}}>{value(rowData[rowOffset])}</div>);
  }

  render() {
    const  {
      loaded, rowData, colsData, parsedData, hasColumns, headerCount, rowCount, columnCount, rows
    } = this.state;
    if (!loaded) {
      return 'Loading';
    }

    const cellHeight = 50, cellWidth = 150, tableHeight = window.innerHeight;


    return (
      <MultiGrid
        cellRenderer={this.renderCell}
        columnWidth={cellWidth}
        columnCount={columnCount}
        rowCount={rowCount}
        rowHeight={cellHeight}
        width={1000}
        height={tableHeight}
        fixedColumnCount={rows.length}
        fixedRowCount={headerCount}
        enableFixedRowScroll
        enableFixedColumnScroll
        overscanIndicesGetter={this.indexGetter}
      />);
  }
}

export default App;
