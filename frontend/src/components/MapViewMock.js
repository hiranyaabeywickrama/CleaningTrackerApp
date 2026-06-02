import React from 'react';
import { View } from 'react-native';

const DummyComponent = (props) => <View {...props} />;

export default DummyComponent;
export const Marker = DummyComponent;
export const Circle = DummyComponent;
export const Polyline = DummyComponent;
