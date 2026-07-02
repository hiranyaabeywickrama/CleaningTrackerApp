import re

with open('frontend/src/screens/RegisterScreen.js', 'r', encoding='utf-8') as f:
    content = f.read()

# Add states
state_injection = '''  const [isAutoDetectingLocation, setIsAutoDetectingLocation] = useState(false);

  useEffect(() => {
    if (selectedRole === 'worker') {
      setIsAutoDetectingLocation(true);
      fetch('http://ip-api.com/json/')
        .then(res => res.json())
        .then(data => {
          if (data.status === 'success') {
            const locStr = ${data.city}, ;
            setStateSearchInput(locStr);
            setSelectedState(locStr);
          }
        })
        .catch(err => console.log('Location detection failed', err))
        .finally(() => setIsAutoDetectingLocation(false));
    }
  }, [selectedRole]);'''

if 'const [isAutoDetectingLocation' not in content:
    content = content.replace('  const [loading, setLoading] = useState(false);', state_injection + '\n  const [loading, setLoading] = useState(false);')

# Modify TextInput for state
old_textinput = '''                  <TextInput
                    style={styles.locationInput}
                    value={stateSearchInput}
                    placeholder="Select or type your state"
                    placeholderTextColor="#94A3B8"
                    onChangeText={(val) => {
                      setStateSearchInput(val);
                      setSelectedState(''); // clear selected until they select a valid option
                      setErrors((e) => ({ ...e, state: '' }));
                      
                      if (val.trim().length > 0) {
                        setShowStateDropdown(true);
                        const query = val.toLowerCase().trim();
                        const filtered = GLOBAL_STATE_OPTIONS.filter(
                          st => st.name.toLowerCase().includes(query) || st.countryName.toLowerCase().includes(query)
                        );
                        setFilteredStates(filtered.slice(0, 100));
                      } else {
                        setFilteredStates([]);
                        setShowStateDropdown(true);
                      }
                    }}
                    onFocus={() => {
                      setShowStateDropdown(true);
                      setShowCategoryDropdown(false);
                      setShowLocationSuggestions(false);
                    }}'''

new_textinput = '''                  <TextInput
                    style={[styles.locationInput, selectedRole === 'worker' && { backgroundColor: '#F8FAFC', color: '#64748B', fontWeight: '800' }]}
                    value={isAutoDetectingLocation ? 'Auto-detecting your location...' : stateSearchInput}
                    editable={selectedRole !== 'worker'}
                    placeholder={selectedRole === 'worker' ? "Auto-detecting..." : "Select or type your state"}
                    placeholderTextColor="#94A3B8"
                    onChangeText={(val) => {
                      if (selectedRole === 'worker') return;
                      setStateSearchInput(val);
                      setSelectedState(''); // clear selected until they select a valid option
                      setErrors((e) => ({ ...e, state: '' }));
                      
                      if (val.trim().length > 0) {
                        setShowStateDropdown(true);
                        const query = val.toLowerCase().trim();
                        const filtered = GLOBAL_STATE_OPTIONS.filter(
                          st => st.name.toLowerCase().includes(query) || st.countryName.toLowerCase().includes(query)
                        );
                        setFilteredStates(filtered.slice(0, 100));
                      } else {
                        setFilteredStates([]);
                        setShowStateDropdown(true);
                      }
                    }}
                    onFocus={() => {
                      if (selectedRole === 'worker') return;
                      setShowStateDropdown(true);
                      setShowCategoryDropdown(false);
                      setShowLocationSuggestions(false);
                    }}'''

content = content.replace(old_textinput, new_textinput)

# Modify Dropdown arrow behavior
old_arrow = '''                    <TouchableOpacity 
                      style={{ position: 'absolute', right: 12, height: '100%', justifyContent: 'center' }}
                      onPress={() => {
                        setShowStateDropdown(!showStateDropdown);
                        setShowCategoryDropdown(false);
                        setShowLocationSuggestions(false);
                      }}
                    >'''

new_arrow = '''                    <TouchableOpacity 
                      style={{ position: 'absolute', right: 12, height: '100%', justifyContent: 'center' }}
                      onPress={() => {
                        if (selectedRole === 'worker') return;
                        setShowStateDropdown(!showStateDropdown);
                        setShowCategoryDropdown(false);
                        setShowLocationSuggestions(false);
                      }}
                    >'''

content = content.replace(old_arrow, new_arrow)

with open('frontend/src/screens/RegisterScreen.js', 'w', encoding='utf-8') as f:
    f.write(content)
print("Updated successfully")
