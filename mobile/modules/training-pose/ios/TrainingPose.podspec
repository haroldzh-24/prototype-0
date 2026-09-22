Pod::Spec.new do |s|
  s.name = 'TrainingPose'
  s.version = '1.0.0'
  s.summary = 'Local training video body pose extraction'
  s.description = 'Bounded sequential AVFoundation frame sampling and Apple Vision body pose.'
  s.license = { :type => 'MIT' }
  s.author = 'Prototype'
  s.homepage = 'https://docs.expo.dev/modules/'
  s.source = { :git => '' }
  s.platforms = { :ios => '16.4' }
  s.swift_version = '5.9'
  s.static_framework = true
  s.dependency 'ExpoModulesCore'
  s.frameworks = 'AVFoundation', 'Vision'
  s.source_files = '**/*.swift'
  s.pod_target_xcconfig = { 'DEFINES_MODULE' => 'YES' }
end
