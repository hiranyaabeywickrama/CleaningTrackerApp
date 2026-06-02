import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Colors } from '../theme/colors';

const JobCard = ({ job, onPress, showWorkerName = false }) => {
  const getStatusConfig = () => {
    switch (job.status) {
      case 'completed':
        return {
          label: 'Completed',
          color: Colors.success,
          bgColor: Colors.successMuted,
          leftBorder: Colors.success
        };
      case 'started':
        return {
          label: 'Active',
          color: Colors.info,
          bgColor: Colors.infoMuted,
          leftBorder: Colors.info
        };
      case 'pending':
      default:
        return {
          label: 'Pending',
          color: Colors.warning,
          bgColor: Colors.warningMuted,
          leftBorder: Colors.warning
        };
    }
  };

  const status = getStatusConfig();

  const formattedDate = job.startTime
    ? new Date(job.startTime).toLocaleString([], {
        month: 'short',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
      })
    : 'N/A';

  return (
    <TouchableOpacity
      activeOpacity={0.85}
      style={[styles.card, { borderLeftColor: status.leftBorder }]}
      onPress={onPress}
      disabled={!onPress}
    >
      <View style={styles.cardHeader}>
        <View style={styles.titleContainer}>
          <Text style={styles.clientName} numberOfLines={1}>
            {job.customerName || job.clientName}
          </Text>
          <Text style={styles.address} numberOfLines={1}>
            📍 {job.address}
          </Text>
        </View>
        <View style={[styles.badge, { backgroundColor: status.bgColor }]}>
          <Text style={[styles.badgeText, { color: status.color }]}>{status.label}</Text>
        </View>
      </View>

      <View style={styles.detailsRow}>
        <View style={styles.metaItem}>
          <Text style={styles.metaLabel}>SCHEDULED TIME</Text>
          <Text style={styles.metaValue}>⏰ {formattedDate}</Text>
        </View>
        
        {job.expectedHours && (
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>EST. DURATION</Text>
            <Text style={[styles.metaValue, { color: Colors.primary }]}>⏳ {job.expectedHours} hrs</Text>
          </View>
        )}

        {job.geofenceRadius && (
          <View style={styles.metaItem}>
            <Text style={styles.metaLabel}>GEOFENCE LIMIT</Text>
            <Text style={styles.metaValue}>🌐 {job.geofenceRadius}m</Text>
          </View>
        )}
      </View>

      {showWorkerName && job.assignedWorker && (
        <View style={styles.workerSection}>
          <View style={styles.workerProfile}>
            <View style={styles.avatarPlaceholder}>
              <Text style={styles.avatarInitials}>
                {job.assignedWorker.name ? job.assignedWorker.name.split(' ').map(n => n[0]).join('').substring(0, 2).toUpperCase() : 'W'}
              </Text>
            </View>
            <Text style={styles.workerText}>
              Assigned to: <Text style={{ color: Colors.text, fontWeight: '700' }}>{job.assignedWorker.name}</Text>
            </Text>
          </View>
          {job.assignedWorker.status && (
            <View style={styles.statusDotWrapper}>
              <View
                style={[
                  styles.dot,
                  {
                    backgroundColor:
                      job.assignedWorker.status === 'cleaning'
                        ? Colors.success
                        : job.assignedWorker.status === 'active_shift'
                        ? Colors.info
                        : Colors.danger
                  }
                ]}
              />
              <Text style={styles.dotLabel}>
                {job.assignedWorker.status === 'cleaning' ? 'Cleaning' : job.assignedWorker.status === 'active_shift' ? 'Online' : 'Offline'}
              </Text>
            </View>
          )}
        </View>
      )}

      {job.status === 'completed' && job.totalHoursWorked > 0 && (
        <View style={styles.completionStats}>
          <Text style={styles.completionText}>
            ⏱️ Actual Work Duration: <Text style={styles.completionHighlight}>{job.totalHoursWorked} hrs</Text>
          </Text>
        </View>
      )}
    </TouchableOpacity>
  );
};

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.card,
    borderRadius: 20,
    padding: 18,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: Colors.cardBorder,
    borderLeftWidth: 5,
    shadowColor: Colors.black,
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.15,
    shadowRadius: 12,
    elevation: 4
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16
  },
  titleContainer: {
    flex: 1,
    marginRight: 8
  },
  clientName: {
    fontSize: 18,
    fontWeight: '900',
    color: Colors.text,
    letterSpacing: 0.2,
    marginBottom: 4
  },
  address: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '600'
  },
  badge: {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center'
  },
  badgeText: {
    fontSize: 11,
    fontWeight: '800',
    textTransform: 'uppercase',
    letterSpacing: 0.5
  },
  detailsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 12,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: '#2D3748'
  },
  metaItem: {
    flex: 1,
    alignItems: 'flex-start'
  },
  metaLabel: {
    fontSize: 9,
    color: Colors.textMuted,
    fontWeight: '800',
    letterSpacing: 0.5,
    marginBottom: 4
  },
  metaValue: {
    fontSize: 12,
    color: Colors.text,
    fontWeight: '700'
  },
  workerSection: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between'
  },
  workerProfile: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  avatarPlaceholder: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#334155',
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 8
  },
  avatarInitials: {
    fontSize: 9,
    color: Colors.text,
    fontWeight: '800'
  },
  workerText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '600'
  },
  statusDotWrapper: {
    flexDirection: 'row',
    alignItems: 'center'
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6
  },
  dotLabel: {
    fontSize: 11,
    color: Colors.textMuted,
    fontWeight: '600'
  },
  completionStats: {
    marginTop: 12,
    backgroundColor: 'rgba(16, 185, 129, 0.08)',
    borderRadius: 10,
    paddingVertical: 8,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(16, 185, 129, 0.15)',
    alignSelf: 'flex-start'
  },
  completionText: {
    fontSize: 12,
    color: Colors.textMuted,
    fontWeight: '600'
  },
  completionHighlight: {
    color: Colors.success,
    fontWeight: '800'
  }
});

export default JobCard;
